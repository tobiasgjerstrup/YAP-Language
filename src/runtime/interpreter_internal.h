#ifndef INTERPRETER_INTERNAL_H
#define INTERPRETER_INTERNAL_H

#include "runtime/interpreter.h"

Variable* find_variable(Interpreter *interp, const char *name);
void define_variable(Interpreter *interp, const char *name, Value value);
void assign_variable(Interpreter *interp, const char *name, Value value);
Function* interp_find_function(Interpreter *interp, const char *name);
void register_function(Interpreter *interp, const char *name, char **params, int param_count, ASTNode *body);

#endif // INTERPRETER_INTERNAL_H
