#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lexer.h"
#include "parser.h"
#include "interpreter.h"

char* read_file(const char *filename) {
    FILE *file = fopen(filename, "r");
    if (!file) {
        fprintf(stderr, "Error: Could not open file '%s'\n", filename);
        return NULL;
    }
    
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    
    char *buffer = malloc(size + 1);
    fread(buffer, 1, size, file);
    buffer[size] = '\0';
    
    fclose(file);
    return buffer;
}

void run_file(const char *filename) {
    char *source = read_file(filename);
    if (!source) return;
    
    Parser *parser = parser_create(source);
    ASTNode *program = parser_parse(parser);
    
    if (parser->error) {
        fprintf(stderr, "Parse error: %s\n", parser->error_msg);
        parser_destroy(parser);
        free(source);
        return;
    }
    
    Interpreter *interp = interpreter_create();
    interpreter_execute(interp, program);
    
    ast_free(program);
    interpreter_destroy(interp);
    parser_destroy(parser);
    free(source);
}

void run_interactive() {
    printf("YAP Language v1.0 - Interactive Mode\n");
    printf("Type 'exit' to quit\n\n");
    
    char buffer[4096];
    
    while (1) {
        printf("> ");
        if (!fgets(buffer, sizeof(buffer), stdin)) break;
        
        if (strcmp(buffer, "exit\n") == 0) break;
        
        Parser *parser = parser_create(buffer);
        ASTNode *program = parser_parse(parser);
        
        if (parser->error) {
            fprintf(stderr, "Error: %s\n", parser->error_msg);
        } else {
            Interpreter *interp = interpreter_create();
            interpreter_execute(interp, program);
            interpreter_destroy(interp);
        }
        
        ast_free(program);
        parser_destroy(parser);
    }
}

int main(int argc, char *argv[]) {
    if (argc == 1) {
        run_interactive();
    } else if (argc == 2) {
        run_file(argv[1]);
    } else {
        fprintf(stderr, "Usage: %s [filename]\n", argv[0]);
        return 1;
    }
    
    return 0;
}
