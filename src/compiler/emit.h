#ifndef COMPILER_EMIT_H
#define COMPILER_EMIT_H

#include "compiler/codegen_ctx.h"

VarType expr_is_string(Codegen *cg, ASTNode *node);
void gen_expr(Codegen *cg, ASTNode *node);
void gen_stmt(Codegen *cg, ASTNode *node);
void gen_print(Codegen *cg, ASTNode *node);

#endif // COMPILER_EMIT_H
