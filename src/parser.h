#ifndef PARSER_H
#define PARSER_H

#include "lexer.h"
#include "ast.h"

typedef struct {
    Lexer *lexer;
    Token current_token;
    int error;
    char error_msg[256];
} Parser;

Parser* parser_create(const char *source);
void parser_destroy(Parser *parser);
ASTNode* parser_parse(Parser *parser);

#endif // PARSER_H
