#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lexer.h"
#include "parser.h"
#include "interpreter.h"
#include "compiler.h"

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
    int compile_mode = 0;
    const char *input_path = NULL;
    const char *output_path = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--compile") == 0) {
            compile_mode = 1;
        } else if (strcmp(argv[i], "-o") == 0) {
            if (i + 1 < argc) {
                output_path = argv[++i];
            } else {
                fprintf(stderr, "Error: -o requires an output path\n");
                return 1;
            }
        } else if (!input_path) {
            input_path = argv[i];
        } else {
            fprintf(stderr, "Usage: %s [--compile] [filename] [-o output]\n", argv[0]);
            return 1;
        }
    }

    if (compile_mode) {
        if (!input_path) {
            fprintf(stderr, "Usage: %s --compile [filename] [-o output]\n", argv[0]);
            return 1;
        }

        char *source = read_file(input_path);
        if (!source) return 1;

        Parser *parser = parser_create(source);
        ASTNode *program = parser_parse(parser);
        if (parser->error) {
            fprintf(stderr, "Parse error: %s\n", parser->error_msg);
            parser_destroy(parser);
            free(source);
            return 1;
        }

        char error[256];
        int rc = compiler_compile(program, output_path, error, sizeof(error));
        if (rc != 0) {
            fprintf(stderr, "Compile error: %s\n", error);
        }

        ast_free(program);
        parser_destroy(parser);
        free(source);

        return rc != 0 ? 1 : 0;
    }

    if (argc == 1) {
        run_interactive();
    } else if (argc == 2 && input_path) {
        run_file(input_path);
    } else {
        fprintf(stderr, "Usage: %s [filename]\n", argv[0]);
        return 1;
    }
    
    return 0;
}
