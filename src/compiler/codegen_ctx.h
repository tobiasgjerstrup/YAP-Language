#ifndef CODEGEN_CTX_H
#define CODEGEN_CTX_H

#include "ast.h"
#include <stdio.h>

#define MAX_LOCALS 256
#define MAX_LABELS 1024
#define MAX_FUNCTIONS 256
#define MAX_STRINGS 256
#define MAX_TRY_DEPTH 64

typedef enum {
    TYPE_INT = 0,
    TYPE_STRING = 1,
    TYPE_BOOL = 2,
    TYPE_ARRAY = 3,
    TYPE_ARRAY2 = 4,
    TYPE_ARRAY_STR = 5,
    TYPE_ARRAY2_STR = 6
} VarType;

typedef struct {
    char *name;
    int offset;
    VarType type;
} Local;

typedef struct {
    char *name;
    ASTNode *body;
    char **params;
    int param_count;
    VarType *param_types;
} FunctionDef;

typedef struct {
    char *value;
    int label_id;
} StringConstant;

typedef struct {
    FILE *out;
    Local locals[MAX_LOCALS];
    int local_count;
    char *declared_vars[MAX_LOCALS];
    int declared_var_count;
    int label_counter;
    int stack_size;
    char error[256];
    int has_error;
    FunctionDef functions[MAX_FUNCTIONS];
    int function_count;
    StringConstant strings[MAX_STRINGS];
    int string_count;
    const char *current_function_name;
    int try_depth;
    int try_catch_labels[MAX_TRY_DEPTH];
    int try_finally_labels[MAX_TRY_DEPTH];
    int try_has_catch[MAX_TRY_DEPTH];
} Codegen;

void set_error(Codegen *cg, ASTNode *node, const char *fmt, ...);
void emit(Codegen *cg, const char *fmt, ...);
int get_label(Codegen *cg);
int find_local(Codegen *cg, const char *name);
int add_local(Codegen *cg, const char *name);
void set_local_type(Codegen *cg, const char *name, VarType type);
VarType get_local_type(Codegen *cg, const char *name);
void free_locals(Codegen *cg);
FunctionDef* find_function(Codegen *cg, const char *name);
VarType merge_types(VarType existing, VarType incoming);
int find_string(Codegen *cg, const char *value);
int add_string(Codegen *cg, const char *value);

#endif // CODEGEN_CTX_H
