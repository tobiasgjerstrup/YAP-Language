#ifndef LEXER_H
#define LEXER_H

#include <stddef.h>

typedef enum {
    // Literals
    TOKEN_INT,
    TOKEN_STRING,
    TOKEN_IDENTIFIER,
    
    // Keywords
    TOKEN_VAR,
    TOKEN_IF,
    TOKEN_ELSE,
    TOKEN_WHILE,
    TOKEN_FN,
    TOKEN_RETURN,
    TOKEN_PRINT,
    TOKEN_TRUE,
    TOKEN_FALSE,
    
    // Operators
    TOKEN_PLUS,
    TOKEN_MINUS,
    TOKEN_MUL,
    TOKEN_DIV,
    TOKEN_MOD,
    TOKEN_ASSIGN,
    TOKEN_EQ,
    TOKEN_NEQ,
    TOKEN_LT,
    TOKEN_LTE,
    TOKEN_GT,
    TOKEN_GTE,
    TOKEN_AND,
    TOKEN_OR,
    TOKEN_NOT,
    
    // Delimiters
    TOKEN_LPAREN,
    TOKEN_RPAREN,
    TOKEN_LBRACE,
    TOKEN_RBRACE,
    TOKEN_SEMICOLON,
    TOKEN_COMMA,
    
    // Special
    TOKEN_EOF,
    TOKEN_ERROR
} TokenType;

typedef struct {
    TokenType type;
    char *value;
    int line;
    int column;
} Token;

typedef struct {
    char *source;
    size_t pos;
    size_t line;
    size_t column;
} Lexer;

Lexer* lexer_create(const char *source);
void lexer_destroy(Lexer *lexer);
Token lexer_next_token(Lexer *lexer);
void token_free(Token token);

#endif // LEXER_H
