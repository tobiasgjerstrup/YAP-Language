#include <stddef.h>
typedef struct ASTNode ASTNode;
// Transpile a YAP program to C (minimal: only print statements)
int compiler_transpile_to_c(ASTNode *program, const char *output_path, char *error, size_t error_size);
#ifndef COMPILER_H
#define COMPILER_H

#include "ast.h"
#include "compiler/codegen_ctx.h"
#include <stddef.h>

// Compile the AST to a native executable using the system toolchain.
// Returns 0 on success, non-zero on failure. On failure, error message is set.
int compiler_compile(ASTNode *program, const char *output_path, char *error, size_t error_size);
// C transpiler stub
void transpile_stmt_to_c(Codegen *cg, ASTNode *node);

#endif // COMPILER_H
