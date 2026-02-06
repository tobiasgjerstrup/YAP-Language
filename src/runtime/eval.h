#ifndef INTERPRETER_EVAL_H
#define INTERPRETER_EVAL_H

#include "runtime/interpreter.h"

Value eval_node(Interpreter *interp, ASTNode *node);

#endif // INTERPRETER_EVAL_H
