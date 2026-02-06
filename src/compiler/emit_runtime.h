#ifndef COMPILER_EMIT_RUNTIME_H
#define COMPILER_EMIT_RUNTIME_H

#include "compiler/codegen_ctx.h"

void emit_string_section(Codegen *cg);
void emit_runtime_helpers(Codegen *cg);

#endif // COMPILER_EMIT_RUNTIME_H
