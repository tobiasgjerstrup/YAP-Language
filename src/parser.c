#include "parser.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

Parser* parser_create(const char *source) {
    Parser *parser = malloc(sizeof(Parser));
    parser->lexer = lexer_create(source);
    parser->current_token = lexer_next_token(parser->lexer);
    parser->error = 0;
    strcpy(parser->error_msg, "");
    return parser;
}

void parser_destroy(Parser *parser) {
    if (parser) {
        token_free(parser->current_token);
        lexer_destroy(parser->lexer);
        free(parser);
    }
}

static void advance(Parser *parser) {
    token_free(parser->current_token);
    parser->current_token = lexer_next_token(parser->lexer);
}

static void set_error(Parser *parser, const char *msg) {
    parser->error = 1;
    snprintf(parser->error_msg, 256, "Line %d:%d: %s", 
             parser->current_token.line, parser->current_token.column, msg);
}

static void set_location(ASTNode *node, Token token) {
    if (node) {
        node->line = token.line;
        node->column = token.column;
    }
}

static int match(Parser *parser, TokenType type) {
    return parser->current_token.type == type;
}

static int check(Parser *parser, TokenType type) {
    return parser->current_token.type == type;
}

static void consume(Parser *parser, TokenType type, const char *msg) {
    if (!check(parser, type)) {
        set_error(parser, msg);
    }
    advance(parser);
}

// Forward declarations
static ASTNode* parse_statement(Parser *parser);
static ASTNode* parse_expression(Parser *parser);
static ASTNode* parse_func_decl_internal(Parser *parser, int is_exported);
static ASTNode* parse_import_stmt(Parser *parser);

static ASTNode* parse_primary(Parser *parser) {
    if (match(parser, TOKEN_INT)) {
        Token tok = parser->current_token;
        int value = atoi(parser->current_token.value);
        advance(parser);
        ASTNode *node = ast_create_int_literal(value);
        set_location(node, tok);
        return node;
    }
    
    if (match(parser, TOKEN_STRING)) {
        Token tok = parser->current_token;
        char *value = malloc(strlen(parser->current_token.value) + 1);
        strcpy(value, parser->current_token.value);
        advance(parser);
        ASTNode *node = ast_create_string_literal(value);
        set_location(node, tok);
        free(value);
        return node;
    }
    
    if (match(parser, TOKEN_TRUE)) {
        Token tok = parser->current_token;
        advance(parser);
        ASTNode *node = ast_create_bool_literal(1);
        set_location(node, tok);
        return node;
    }
    
    if (match(parser, TOKEN_FALSE)) {
        Token tok = parser->current_token;
        advance(parser);
        ASTNode *node = ast_create_bool_literal(0);
        set_location(node, tok);
        return node;
    }
    
    if (match(parser, TOKEN_IDENTIFIER)) {
        Token tok = parser->current_token;
        char *name = malloc(strlen(parser->current_token.value) + 1);
        strcpy(name, parser->current_token.value);
        advance(parser);
        
        // Check for function call
        if (match(parser, TOKEN_LPAREN)) {
            advance(parser);
            
            ASTNode **args = NULL;
            int arg_count = 0;
            
            if (!check(parser, TOKEN_RPAREN)) {
                args = malloc(sizeof(ASTNode*) * 256);
                args[arg_count++] = parse_expression(parser);
                
                while (match(parser, TOKEN_COMMA)) {
                    advance(parser);
                    args[arg_count++] = parse_expression(parser);
                }
            }
            
            consume(parser, TOKEN_RPAREN, "Expected ')'");
            ASTNode *node = ast_create_call(name, args, arg_count);
            set_location(node, tok);
            free(name);
            return node;
        }
        
        ASTNode *node = ast_create_identifier(name);
        set_location(node, tok);
        free(name);
        return node;
    }
    
    if (match(parser, TOKEN_LPAREN)) {
        advance(parser);
        ASTNode *expr = parse_expression(parser);
        consume(parser, TOKEN_RPAREN, "Expected ')'");
        return expr;
    }
    
    if (match(parser, TOKEN_NOT)) {
        Token tok = parser->current_token;
        advance(parser);
        ASTNode *operand = parse_primary(parser);
        ASTNode *node = ast_create_unary_op(operand, "!");
        set_location(node, tok);
        return node;
    }
    
    if (match(parser, TOKEN_MINUS)) {
        Token tok = parser->current_token;
        advance(parser);
        ASTNode *operand = parse_primary(parser);
        ASTNode *node = ast_create_unary_op(operand, "-");
        set_location(node, tok);
        return node;
    }
    
    if (match(parser, TOKEN_LBRACKET)) {
        Token tok = parser->current_token;
        advance(parser);
        
        ASTNode **elements = NULL;
        int element_count = 0;
        
        if (!check(parser, TOKEN_RBRACKET)) {
            elements = malloc(sizeof(ASTNode*) * 256);  // Max 256 elements
            do {
                if (match(parser, TOKEN_COMMA)) advance(parser);
                elements[element_count++] = parse_expression(parser);
            } while (match(parser, TOKEN_COMMA));
        }
        
        consume(parser, TOKEN_RBRACKET, "Expected ']'");
        ASTNode *node = ast_create_array_literal(elements, element_count);
        set_location(node, tok);
        return node;
    }
    
    set_error(parser, "Unexpected token in expression");
    return NULL;
}

static ASTNode* parse_postfix(Parser *parser) {
    ASTNode *node = parse_primary(parser);
    
    // Handle array indexing: arr[idx]
    while (match(parser, TOKEN_LBRACKET)) {
        Token tok = parser->current_token;
        advance(parser);
        ASTNode *index = parse_expression(parser);
        consume(parser, TOKEN_RBRACKET, "Expected ']'");
        node = ast_create_array_index(node, index);
        set_location(node, tok);
    }
    
    return node;
}

static ASTNode* parse_term(Parser *parser) {
    ASTNode *node = parse_postfix(parser);
    
    while (match(parser, TOKEN_MUL) || match(parser, TOKEN_DIV) || match(parser, TOKEN_MOD)) {
        Token op_tok = parser->current_token;
        char op[2];
        if (match(parser, TOKEN_MUL)) {
            strcpy(op, "*");
        } else if (match(parser, TOKEN_DIV)) {
            strcpy(op, "/");
        } else {
            strcpy(op, "%");
        }
        advance(parser);
        ASTNode *right = parse_postfix(parser);
        node = ast_create_binary_op(node, right, op);
        set_location(node, op_tok);
    }
    
    return node;
}

static ASTNode* parse_additive(Parser *parser) {
    ASTNode *node = parse_term(parser);
    
    while (match(parser, TOKEN_PLUS) || match(parser, TOKEN_MINUS)) {
        Token op_tok = parser->current_token;
        char op[2];
        if (match(parser, TOKEN_PLUS)) {
            strcpy(op, "+");
        } else {
            strcpy(op, "-");
        }
        advance(parser);
        ASTNode *right = parse_term(parser);
        node = ast_create_binary_op(node, right, op);
        set_location(node, op_tok);
    }
    
    return node;
}

static ASTNode* parse_comparison(Parser *parser) {
    ASTNode *node = parse_additive(parser);
    
    while (match(parser, TOKEN_LT) || match(parser, TOKEN_LTE) || 
           match(parser, TOKEN_GT) || match(parser, TOKEN_GTE) ||
           match(parser, TOKEN_EQ) || match(parser, TOKEN_NEQ)) {
        Token op_tok = parser->current_token;
        char op[3];
        if (match(parser, TOKEN_LT)) {
            strcpy(op, "<");
        } else if (match(parser, TOKEN_LTE)) {
            strcpy(op, "<=");
        } else if (match(parser, TOKEN_GT)) {
            strcpy(op, ">");
        } else if (match(parser, TOKEN_GTE)) {
            strcpy(op, ">=");
        } else if (match(parser, TOKEN_EQ)) {
            strcpy(op, "==");
        } else {
            strcpy(op, "!=");
        }
        advance(parser);
        ASTNode *right = parse_additive(parser);
        node = ast_create_binary_op(node, right, op);
        set_location(node, op_tok);
    }
    
    return node;
}

static ASTNode* parse_logical_and(Parser *parser) {
    ASTNode *node = parse_comparison(parser);
    
    while (match(parser, TOKEN_AND)) {
        Token op_tok = parser->current_token;
        advance(parser);
        ASTNode *right = parse_comparison(parser);
        node = ast_create_binary_op(node, right, "&&");
        set_location(node, op_tok);
    }
    
    return node;
}

static ASTNode* parse_logical_or(Parser *parser) {
    ASTNode *node = parse_logical_and(parser);
    
    while (match(parser, TOKEN_OR)) {
        Token op_tok = parser->current_token;
        advance(parser);
        ASTNode *right = parse_logical_and(parser);
        node = ast_create_binary_op(node, right, "||");
        set_location(node, op_tok);
    }
    
    return node;
}

static ASTNode* parse_expression(Parser *parser) {
    return parse_logical_or(parser);
}

static ASTNode* parse_var_decl(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_VAR, "Expected 'var'");
    
    if (!match(parser, TOKEN_IDENTIFIER)) {
        set_error(parser, "Expected identifier after 'var'");
        return NULL;
    }
    
    char *name = malloc(strlen(parser->current_token.value) + 1);
    strcpy(name, parser->current_token.value);
    advance(parser);
    
    ASTNode *value = NULL;
    if (match(parser, TOKEN_ASSIGN)) {
        advance(parser);
        value = parse_expression(parser);
    }
    
    consume(parser, TOKEN_SEMICOLON, "Expected ';'");
    
    ASTNode *node = ast_create_var_decl(name, value);
    set_location(node, start_tok);
    free(name);
    return node;
}

static ASTNode* parse_block(Parser *parser) {
    consume(parser, TOKEN_LBRACE, "Expected '{'");
    
    ASTNode **statements = malloc(sizeof(ASTNode*) * 256);
    int count = 0;
    
    while (!check(parser, TOKEN_RBRACE) && !check(parser, TOKEN_EOF) && !parser->error) {
        statements[count++] = parse_statement(parser);
    }
    
    consume(parser, TOKEN_RBRACE, "Expected '}'");
    
    return ast_create_block(statements, count);
}

static ASTNode* parse_if_stmt(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_IF, "Expected 'if'");
    consume(parser, TOKEN_LPAREN, "Expected '('");
    ASTNode *condition = parse_expression(parser);
    consume(parser, TOKEN_RPAREN, "Expected ')'");
    
    ASTNode *then_branch = NULL;
    if (match(parser, TOKEN_LBRACE)) {
        then_branch = parse_block(parser);
    } else {
        then_branch = parse_statement(parser);
    }
    
    ASTNode *else_branch = NULL;
    if (match(parser, TOKEN_ELSE)) {
        advance(parser);
        if (match(parser, TOKEN_LBRACE)) {
            else_branch = parse_block(parser);
        } else {
            else_branch = parse_statement(parser);
        }
    }
    
    ASTNode *node = ast_create_if_stmt(condition, then_branch, else_branch);
    set_location(node, start_tok);
    return node;
}

static ASTNode* parse_while_stmt(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_WHILE, "Expected 'while'");
    consume(parser, TOKEN_LPAREN, "Expected '('");
    ASTNode *condition = parse_expression(parser);
    consume(parser, TOKEN_RPAREN, "Expected ')'");
    
    ASTNode *body = NULL;
    if (match(parser, TOKEN_LBRACE)) {
        body = parse_block(parser);
    } else {
        body = parse_statement(parser);
    }
    
    ASTNode *node = ast_create_while_stmt(condition, body);
    set_location(node, start_tok);
    return node;
}

static ASTNode* parse_return_stmt(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_RETURN, "Expected 'return'");
    
    ASTNode *value = NULL;
    if (!match(parser, TOKEN_SEMICOLON)) {
        value = parse_expression(parser);
    }
    
    consume(parser, TOKEN_SEMICOLON, "Expected ';'");
    ASTNode *node = ast_create_return_stmt(value);
    set_location(node, start_tok);
    return node;
}

static ASTNode* parse_print_stmt(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_PRINT, "Expected 'print'");
    consume(parser, TOKEN_LPAREN, "Expected '('");
    ASTNode *value = parse_expression(parser);
    consume(parser, TOKEN_RPAREN, "Expected ')'");
    consume(parser, TOKEN_SEMICOLON, "Expected ';'");
    
    ASTNode *node = ast_create_print_stmt(value);
    set_location(node, start_tok);
    return node;
}

static ASTNode* parse_func_decl_internal(Parser *parser, int is_exported) {
    Token start_tok = parser->current_token;
    
    // Always consume TOKEN_FN regardless of is_exported
    consume(parser, TOKEN_FN, "Expected 'fn'");
    
    if (!match(parser, TOKEN_IDENTIFIER)) {
        set_error(parser, "Expected function name");
        return NULL;
    }
    
    char *name = malloc(strlen(parser->current_token.value) + 1);
    strcpy(name, parser->current_token.value);
    advance(parser);
    
    consume(parser, TOKEN_LPAREN, "Expected '('");
    
    char **params = NULL;
    int param_count = 0;
    
    if (!check(parser, TOKEN_RPAREN)) {
        params = malloc(sizeof(char*) * 256);
        
        if (match(parser, TOKEN_IDENTIFIER)) {
            params[param_count] = malloc(strlen(parser->current_token.value) + 1);
            strcpy(params[param_count], parser->current_token.value);
            param_count++;
            advance(parser);
            
            while (match(parser, TOKEN_COMMA)) {
                advance(parser);
                if (match(parser, TOKEN_IDENTIFIER)) {
                    params[param_count] = malloc(strlen(parser->current_token.value) + 1);
                    strcpy(params[param_count], parser->current_token.value);
                    param_count++;
                    advance(parser);
                }
            }
        }
    }
    
    consume(parser, TOKEN_RPAREN, "Expected ')'");
    
    ASTNode *body = parse_block(parser);
    
    ASTNode *node = ast_create_func_decl(name, params, param_count, body);
    node->data.func_decl.is_exported = is_exported;
    set_location(node, start_tok);
    free(name);
    return node;
}

static ASTNode* parse_import_stmt(Parser *parser) {
    Token start_tok = parser->current_token;
    consume(parser, TOKEN_IMPORT, "Expected 'import'");
    
    // Case 1: import { func1, func2 } from "file.yap"
    // Case 2: import "file.yap" (import all)
    
    char **imports = NULL;
    int import_count = 0;
    
    if (match(parser, TOKEN_LBRACE)) {
        advance(parser);
        
        if (!check(parser, TOKEN_RBRACE)) {
            imports = malloc(sizeof(char*) * 256);
            
            if (match(parser, TOKEN_IDENTIFIER)) {
                imports[import_count] = malloc(strlen(parser->current_token.value) + 1);
                strcpy(imports[import_count], parser->current_token.value);
                import_count++;
                advance(parser);
                
                while (match(parser, TOKEN_COMMA)) {
                    advance(parser);
                    if (match(parser, TOKEN_IDENTIFIER)) {
                        imports[import_count] = malloc(strlen(parser->current_token.value) + 1);
                        strcpy(imports[import_count], parser->current_token.value);
                        import_count++;
                        advance(parser);
                    }
                }
            }
        }
        
        consume(parser, TOKEN_RBRACE, "Expected '}'");
        consume(parser, TOKEN_FROM, "Expected 'from'");
    }
    
    // Get module path
    if (!match(parser, TOKEN_STRING)) {
        set_error(parser, "Expected module path string");
        return NULL;
    }
    
    char *module_path = malloc(strlen(parser->current_token.value) + 1);
    strcpy(module_path, parser->current_token.value);
    advance(parser);
    
    // Consume optional semicolon
    if (match(parser, TOKEN_SEMICOLON)) {
        advance(parser);
    }
    
    ASTNode *node = ast_create_import_stmt(module_path, imports, import_count);
    set_location(node, start_tok);
    free(module_path);
    return node;
}

static ASTNode* parse_assignment_or_expression(Parser *parser) {
    ASTNode *expr = parse_expression(parser);
    
    if (match(parser, TOKEN_ASSIGN)) {
        if (expr->type == NODE_IDENTIFIER) {
            Token tok = {0};
            tok.line = expr->line;
            tok.column = expr->column;
            
            char *name = malloc(strlen(expr->data.identifier.name) + 1);
            strcpy(name, expr->data.identifier.name);
            
            advance(parser);
            ASTNode *value = parse_expression(parser);
            consume(parser, TOKEN_SEMICOLON, "Expected ';'");
            
            ast_free(expr);
            ASTNode *node = ast_create_assignment(name, value);
            set_location(node, tok);
            free(name);
            return node;
        }
    }
    
    consume(parser, TOKEN_SEMICOLON, "Expected ';'");
    return expr;
}

static ASTNode* parse_statement(Parser *parser) {
    if (parser->error) return NULL;
    
    if (match(parser, TOKEN_IMPORT)) {
        return parse_import_stmt(parser);
    }
    
    if (match(parser, TOKEN_EXPORT)) {
        advance(parser);  // consume EXPORT
        if (!match(parser, TOKEN_FN)) {
            set_error(parser, "export can only be used with functions");
            return NULL;
        }
        // parse_func_decl_internal will consume FN
        ASTNode *func = parse_func_decl_internal(parser, 1);
        return func;
    }
    
    if (match(parser, TOKEN_VAR)) {
        return parse_var_decl(parser);
    }
    
    if (match(parser, TOKEN_FN)) {
        return parse_func_decl_internal(parser, 0);
    }
    
    if (match(parser, TOKEN_IF)) {
        return parse_if_stmt(parser);
    }
    
    if (match(parser, TOKEN_WHILE)) {
        return parse_while_stmt(parser);
    }
    
    if (match(parser, TOKEN_RETURN)) {
        return parse_return_stmt(parser);
    }
    
    if (match(parser, TOKEN_PRINT)) {
        return parse_print_stmt(parser);
    }
    
    if (match(parser, TOKEN_LBRACE)) {
        return parse_block(parser);
    }
    
    return parse_assignment_or_expression(parser);
}

ASTNode* parser_parse(Parser *parser) {
    ASTNode **statements = malloc(sizeof(ASTNode*) * 1024);
    int count = 0;
    
    while (!check(parser, TOKEN_EOF) && !parser->error) {
        statements[count++] = parse_statement(parser);
    }
    
    return ast_create_program(statements, count);
}
