#ifndef COMPILER_EMIT_H
#define COMPILER_EMIT_H

#include "compiler/codegen_ctx.h"

// C code emission for transpiler
void emit_c_print(Codegen *cg, ASTNode *node);
void emit_c(Codegen *cg, const char *fmt, ...);
void gen_c_expr(Codegen *cg, ASTNode *expr, char *buf, size_t buflen);
VarType expr_is_string(Codegen *cg, ASTNode *node);
void gen_expr(Codegen *cg, ASTNode *node);
void gen_stmt(Codegen *cg, ASTNode *node);
void gen_print(Codegen *cg, ASTNode *node);
void emit_c_assignment(Codegen *cg, ASTNode *node);
void emit_c_var_decl(Codegen *cg, ASTNode *node);

#endif // COMPILER_EMIT_H
