#include "lexer.h"
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

Lexer* lexer_create(const char *source) {
    Lexer *lexer = malloc(sizeof(Lexer));
    lexer->source = malloc(strlen(source) + 1);
    strcpy(lexer->source, source);
    lexer->pos = 0;
    lexer->line = 1;
    lexer->column = 1;
    return lexer;
}

void lexer_destroy(Lexer *lexer) {
    if (lexer) {
        free(lexer->source);
        free(lexer);
    }
}

void token_free(Token token) {
    if (token.value) {
        free(token.value);
    }
}

static char current_char(Lexer *lexer) {
    if (lexer->pos >= strlen(lexer->source)) {
        return '\0';
    }
    return lexer->source[lexer->pos];
}

static char peek_char(Lexer *lexer, int offset) {
    size_t pos = lexer->pos + offset;
    if (pos >= strlen(lexer->source)) {
        return '\0';
    }
    return lexer->source[pos];
}

static void advance(Lexer *lexer) {
    if (current_char(lexer) == '\n') {
        lexer->line++;
        lexer->column = 1;
    } else {
        lexer->column++;
    }
    lexer->pos++;
}

static void skip_whitespace(Lexer *lexer) {
    while (isspace(current_char(lexer))) {
        advance(lexer);
    }
}

static void skip_comment(Lexer *lexer) {
    if (current_char(lexer) == '/' && peek_char(lexer, 1) == '/') {
        while (current_char(lexer) != '\n' && current_char(lexer) != '\0') {
            advance(lexer);
        }
    }
}

static char* read_string(Lexer *lexer) {
    advance(lexer); // skip opening quote
    char *result = malloc(256);
    int len = 0;
    
    while (current_char(lexer) != '"' && current_char(lexer) != '\0') {
        result[len++] = current_char(lexer);
        advance(lexer);
    }
    
    if (current_char(lexer) == '"') {
        advance(lexer); // skip closing quote
    }
    
    result[len] = '\0';
    return result;
}

static char* read_number(Lexer *lexer) {
    char *result = malloc(64);
    int len = 0;
    
    while (isdigit(current_char(lexer))) {
        result[len++] = current_char(lexer);
        advance(lexer);
    }
    
    result[len] = '\0';
    return result;
}

static char* read_identifier(Lexer *lexer) {
    char *result = malloc(256);
    int len = 0;
    
    while (isalnum(current_char(lexer)) || current_char(lexer) == '_') {
        result[len++] = current_char(lexer);
        advance(lexer);
    }
    
    result[len] = '\0';
    return result;
}

static TokenType keyword_type(const char *ident) {
    if (strcmp(ident, "var") == 0) return TOKEN_VAR;
    if (strcmp(ident, "if") == 0) return TOKEN_IF;
    if (strcmp(ident, "else") == 0) return TOKEN_ELSE;
    if (strcmp(ident, "while") == 0) return TOKEN_WHILE;
    if (strcmp(ident, "fn") == 0) return TOKEN_FN;
    if (strcmp(ident, "return") == 0) return TOKEN_RETURN;
    if (strcmp(ident, "print") == 0) return TOKEN_PRINT;
    if (strcmp(ident, "true") == 0) return TOKEN_TRUE;
    if (strcmp(ident, "false") == 0) return TOKEN_FALSE;
    return TOKEN_IDENTIFIER;
}

Token lexer_next_token(Lexer *lexer) {
    Token token;
    token.line = lexer->line;
    token.column = lexer->column;
    
    skip_whitespace(lexer);
    while (current_char(lexer) == '/' && peek_char(lexer, 1) == '/') {
        skip_comment(lexer);
        skip_whitespace(lexer);
    }
    
    token.line = lexer->line;
    token.column = lexer->column;
    
    char ch = current_char(lexer);
    
    if (ch == '\0') {
        token.type = TOKEN_EOF;
        token.value = NULL;
        return token;
    }
    
    if (ch == '"') {
        token.type = TOKEN_STRING;
        token.value = read_string(lexer);
        return token;
    }
    
    if (isdigit(ch)) {
        token.type = TOKEN_INT;
        token.value = read_number(lexer);
        return token;
    }
    
    if (isalpha(ch) || ch == '_') {
        char *ident = read_identifier(lexer);
        token.type = keyword_type(ident);
        token.value = ident;
        return token;
    }
    
    // Single/double character operators
    advance(lexer);
    
    if (ch == '+') { token.type = TOKEN_PLUS; token.value = NULL; return token; }
    if (ch == '-') { token.type = TOKEN_MINUS; token.value = NULL; return token; }
    if (ch == '*') { token.type = TOKEN_MUL; token.value = NULL; return token; }
    if (ch == '/') { token.type = TOKEN_DIV; token.value = NULL; return token; }
    if (ch == '%') { token.type = TOKEN_MOD; token.value = NULL; return token; }
    if (ch == '(') { token.type = TOKEN_LPAREN; token.value = NULL; return token; }
    if (ch == ')') { token.type = TOKEN_RPAREN; token.value = NULL; return token; }
    if (ch == '{') { token.type = TOKEN_LBRACE; token.value = NULL; return token; }
    if (ch == '}') { token.type = TOKEN_RBRACE; token.value = NULL; return token; }
    if (ch == '[') { token.type = TOKEN_LBRACKET; token.value = NULL; return token; }
    if (ch == ']') { token.type = TOKEN_RBRACKET; token.value = NULL; return token; }
    if (ch == ';') { token.type = TOKEN_SEMICOLON; token.value = NULL; return token; }
    if (ch == ',') { token.type = TOKEN_COMMA; token.value = NULL; return token; }
    
    if (ch == '=') {
        if (current_char(lexer) == '=') {
            advance(lexer);
            token.type = TOKEN_EQ;
        } else {
            token.type = TOKEN_ASSIGN;
        }
        token.value = NULL;
        return token;
    }
    
    if (ch == '!') {
        if (current_char(lexer) == '=') {
            advance(lexer);
            token.type = TOKEN_NEQ;
        } else {
            token.type = TOKEN_NOT;
        }
        token.value = NULL;
        return token;
    }
    
    if (ch == '<') {
        if (current_char(lexer) == '=') {
            advance(lexer);
            token.type = TOKEN_LTE;
        } else {
            token.type = TOKEN_LT;
        }
        token.value = NULL;
        return token;
    }
    
    if (ch == '>') {
        if (current_char(lexer) == '=') {
            advance(lexer);
            token.type = TOKEN_GTE;
        } else {
            token.type = TOKEN_GT;
        }
        token.value = NULL;
        return token;
    }
    
    if (ch == '&') {
        if (current_char(lexer) == '&') {
            advance(lexer);
            token.type = TOKEN_AND;
            token.value = NULL;
            return token;
        }
    }
    
    if (ch == '|') {
        if (current_char(lexer) == '|') {
            advance(lexer);
            token.type = TOKEN_OR;
            token.value = NULL;
            return token;
        }
    }
    
    token.type = TOKEN_ERROR;
    token.value = malloc(2);
    token.value[0] = ch;
    token.value[1] = '\0';
    return token;
}
