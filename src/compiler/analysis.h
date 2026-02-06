#ifndef COMPILER_ANALYSIS_H
#define COMPILER_ANALYSIS_H

#include "compiler/codegen_ctx.h"

void prepass_strings(Codegen *cg, ASTNode *node);
void prepass_functions(Codegen *cg, ASTNode *node);
VarType infer_expr_type(Codegen *cg, ASTNode *node, FunctionDef *current_func);
void infer_param_types(Codegen *cg, ASTNode *node, FunctionDef *current_func, int *changed);
void collect_locals(Codegen *cg, ASTNode *node);

#endif // COMPILER_ANALYSIS_H
