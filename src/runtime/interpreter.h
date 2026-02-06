#ifndef INTERPRETER_H
#define INTERPRETER_H

#include "ast.h"
#include "runtime/value.h"

typedef struct Function {
    char *name;
    char **params;
    int param_count;
    ASTNode *body;
} Function;

typedef struct Variable {
    char *name;
    Value value;
    struct Variable *next;
} Variable;

typedef struct Scope {
    Variable *variables;
    struct Scope *parent;
} Scope;

typedef struct {
    Scope *current_scope;
    Function **functions;
    int function_count;
    int return_flag;
    Value return_value;
    int error_flag;
    int error_line;
    int error_column;
    char *error_message;
} Interpreter;

Interpreter* interpreter_create(void);
void interpreter_destroy(Interpreter *interp);
void interpreter_execute(Interpreter *interp, ASTNode *program);
Value interpreter_eval(Interpreter *interp, ASTNode *node);
void interpreter_define_global(Interpreter *interp, const char *name, Value value);

#endif // INTERPRETER_H
