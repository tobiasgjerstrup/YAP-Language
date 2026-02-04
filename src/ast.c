#include "ast.h"
#include <stdlib.h>
#include <string.h>

static ASTNode* ast_create_node(NodeType type) {
    ASTNode *node = malloc(sizeof(ASTNode));
    node->type = type;
    node->line = 0;
    node->column = 0;
    node->statements = NULL;
    node->statement_count = 0;
    return node;
}

ASTNode* ast_create_program(ASTNode **statements, int count) {
    ASTNode *node = ast_create_node(NODE_PROGRAM);
    node->statements = statements;
    node->statement_count = count;
    return node;
}

ASTNode* ast_create_var_decl(const char *name, ASTNode *value) {
    ASTNode *node = ast_create_node(NODE_VAR_DECL);
    node->data.var_decl.name = malloc(strlen(name) + 1);
    strcpy(node->data.var_decl.name, name);
    node->data.var_decl.value = value;
    return node;
}

ASTNode* ast_create_func_decl(const char *name, char **params, int param_count, ASTNode *body) {
    ASTNode *node = ast_create_node(NODE_FUNC_DECL);
    node->data.func_decl.name = malloc(strlen(name) + 1);
    strcpy(node->data.func_decl.name, name);
    node->data.func_decl.params = params;
    node->data.func_decl.param_count = param_count;
    node->data.func_decl.body = body;
    node->data.func_decl.is_exported = 0;
    return node;
}

ASTNode* ast_create_if_stmt(ASTNode *condition, ASTNode *then_branch, ASTNode *else_branch) {
    ASTNode *node = ast_create_node(NODE_IF_STMT);
    node->data.if_stmt.condition = condition;
    node->data.if_stmt.then_branch = then_branch;
    node->data.if_stmt.else_branch = else_branch;
    return node;
}

ASTNode* ast_create_while_stmt(ASTNode *condition, ASTNode *body) {
    ASTNode *node = ast_create_node(NODE_WHILE_STMT);
    node->data.while_stmt.condition = condition;
    node->data.while_stmt.body = body;
    return node;
}

ASTNode* ast_create_return_stmt(ASTNode *value) {
    ASTNode *node = ast_create_node(NODE_RETURN_STMT);
    node->data.return_stmt.value = value;
    return node;
}

ASTNode* ast_create_print_stmt(ASTNode *value) {
    ASTNode *node = ast_create_node(NODE_PRINT_STMT);
    node->data.print_stmt.value = value;
    return node;
}

ASTNode* ast_create_assignment(const char *name, ASTNode *value) {
    ASTNode *node = ast_create_node(NODE_ASSIGNMENT);
    node->data.assignment.name = malloc(strlen(name) + 1);
    strcpy(node->data.assignment.name, name);
    node->data.assignment.value = value;
    return node;
}

ASTNode* ast_create_call(const char *name, ASTNode **args, int arg_count) {
    ASTNode *node = ast_create_node(NODE_CALL);
    node->data.call.name = malloc(strlen(name) + 1);
    strcpy(node->data.call.name, name);
    node->data.call.args = args;
    node->data.call.arg_count = arg_count;
    return node;
}

ASTNode* ast_create_binary_op(ASTNode *left, ASTNode *right, const char *op) {
    ASTNode *node = ast_create_node(NODE_BINARY_OP);
    node->data.binary_op.left = left;
    node->data.binary_op.right = right;
    node->data.binary_op.op = malloc(strlen(op) + 1);
    strcpy(node->data.binary_op.op, op);
    return node;
}

ASTNode* ast_create_unary_op(ASTNode *operand, const char *op) {
    ASTNode *node = ast_create_node(NODE_UNARY_OP);
    node->data.unary_op.operand = operand;
    node->data.unary_op.op = malloc(strlen(op) + 1);
    strcpy(node->data.unary_op.op, op);
    return node;
}

ASTNode* ast_create_block(ASTNode **statements, int count) {
    ASTNode *node = ast_create_node(NODE_BLOCK);
    node->statements = statements;
    node->statement_count = count;
    return node;
}

ASTNode* ast_create_int_literal(int value) {
    ASTNode *node = ast_create_node(NODE_INT_LITERAL);
    node->data.int_literal.value = value;
    return node;
}

ASTNode* ast_create_string_literal(const char *value) {
    ASTNode *node = ast_create_node(NODE_STRING_LITERAL);
    node->data.string_literal.value = malloc(strlen(value) + 1);
    strcpy(node->data.string_literal.value, value);
    return node;
}

ASTNode* ast_create_bool_literal(int value) {
    ASTNode *node = ast_create_node(NODE_BOOL_LITERAL);
    node->data.bool_literal.value = value ? 1 : 0;
    return node;
}

ASTNode* ast_create_identifier(const char *name) {
    ASTNode *node = ast_create_node(NODE_IDENTIFIER);
    node->data.identifier.name = malloc(strlen(name) + 1);
    strcpy(node->data.identifier.name, name);
    return node;
}

ASTNode* ast_create_array_literal(ASTNode **elements, int count) {
    ASTNode *node = ast_create_node(NODE_ARRAY_LITERAL);
    node->data.array_literal.elements = elements;
    node->data.array_literal.element_count = count;
    return node;
}

ASTNode* ast_create_array_index(ASTNode *array, ASTNode *index) {
    ASTNode *node = ast_create_node(NODE_ARRAY_INDEX);
    node->data.array_index.array = array;
    node->data.array_index.index = index;
    return node;
}

ASTNode* ast_create_import_stmt(const char *module_path, char **imports, int import_count) {
    ASTNode *node = ast_create_node(NODE_IMPORT);
    node->data.import_stmt.module_path = malloc(strlen(module_path) + 1);
    strcpy(node->data.import_stmt.module_path, module_path);
    node->data.import_stmt.imports = imports;
    node->data.import_stmt.import_count = import_count;
    return node;
}

void ast_free(ASTNode *node) {
    if (!node) return;
    
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                ast_free(node->statements[i]);
            }
            if (node->statements) free(node->statements);
            break;
        case NODE_VAR_DECL:
            free(node->data.var_decl.name);
            ast_free(node->data.var_decl.value);
            break;
        case NODE_FUNC_DECL:
            free(node->data.func_decl.name);
            if (node->data.func_decl.params) {
                for (int i = 0; i < node->data.func_decl.param_count; i++) {
                    free(node->data.func_decl.params[i]);
                }
                free(node->data.func_decl.params);
            }
            ast_free(node->data.func_decl.body);
            break;
        case NODE_IF_STMT:
            ast_free(node->data.if_stmt.condition);
            ast_free(node->data.if_stmt.then_branch);
            ast_free(node->data.if_stmt.else_branch);
            break;
        case NODE_WHILE_STMT:
            ast_free(node->data.while_stmt.condition);
            ast_free(node->data.while_stmt.body);
            break;
        case NODE_RETURN_STMT:
            ast_free(node->data.return_stmt.value);
            break;
        case NODE_PRINT_STMT:
            ast_free(node->data.print_stmt.value);
            break;
        case NODE_ASSIGNMENT:
            free(node->data.assignment.name);
            ast_free(node->data.assignment.value);
            break;
        case NODE_CALL:
            free(node->data.call.name);
            if (node->data.call.args) {
                for (int i = 0; i < node->data.call.arg_count; i++) {
                    ast_free(node->data.call.args[i]);
                }
                free(node->data.call.args);
            }
            break;
        case NODE_BINARY_OP:
            ast_free(node->data.binary_op.left);
            ast_free(node->data.binary_op.right);
            free(node->data.binary_op.op);
            break;
        case NODE_UNARY_OP:
            ast_free(node->data.unary_op.operand);
            free(node->data.unary_op.op);
            break;
        case NODE_STRING_LITERAL:
            free(node->data.string_literal.value);
            break;
        case NODE_IDENTIFIER:
            free(node->data.identifier.name);
            break;
        case NODE_ARRAY_LITERAL:
            if (node->data.array_literal.elements) {
                for (int i = 0; i < node->data.array_literal.element_count; i++) {
                    ast_free(node->data.array_literal.elements[i]);
                }
                free(node->data.array_literal.elements);
            }
            break;
        case NODE_ARRAY_INDEX:
            ast_free(node->data.array_index.array);
            ast_free(node->data.array_index.index);
            break;
        case NODE_IMPORT:
            free(node->data.import_stmt.module_path);
            if (node->data.import_stmt.imports) {
                for (int i = 0; i < node->data.import_stmt.import_count; i++) {
                    free(node->data.import_stmt.imports[i]);
                }
                free(node->data.import_stmt.imports);
            }
            break;
        default:
            break;
    }
    
    free(node);
}
