#ifndef INTERPRETER_H
#define INTERPRETER_H

#include "ast.h"

typedef enum {
    VALUE_INT,
    VALUE_STRING,
    VALUE_BOOL,
    VALUE_NULL
} ValueType;

typedef struct {
    ValueType type;
    union {
        int int_val;
        char *string_val;
        int bool_val;
    } data;
} Value;

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
} Interpreter;

Interpreter* interpreter_create();
void interpreter_destroy(Interpreter *interp);
void interpreter_execute(Interpreter *interp, ASTNode *program);
Value interpreter_eval(Interpreter *interp, ASTNode *node);

Value value_create_int(int val);
Value value_create_string(const char *val);
Value value_create_bool(int val);
Value value_create_null();
void value_free(Value v);
int value_to_int(Value v);
char* value_to_string(Value v);
int value_to_bool(Value v);

#endif // INTERPRETER_H
