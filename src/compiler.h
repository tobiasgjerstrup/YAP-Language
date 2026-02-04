#ifndef COMPILER_H
#define COMPILER_H

#include "ast.h"
#include <stddef.h>

// Compile the AST to a native executable using the system toolchain.
// Returns 0 on success, non-zero on failure. On failure, error message is set.
int compiler_compile(ASTNode *program, const char *output_path, char *error, size_t error_size);

#endif // COMPILER_H
