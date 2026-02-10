#include "compiler/emit.h"
#include "compiler/codegen_ctx.h"
#include <stdio.h>
#include <string.h>
#include <stdarg.h>

// Minimal C code emitter for transpiling YAP print() to C
void emit_c_print(Codegen *cg, ASTNode *node) {
    VarType print_type = expr_is_string(cg, node->data.print_stmt.value);
    char expr_buf[256];
    gen_c_expr(cg, node->data.print_stmt.value, expr_buf, sizeof(expr_buf));
    char c_line[512];
    if (print_type == TYPE_STRING) {
        snprintf(c_line, sizeof(c_line), "printf(\"%%s\\n\", %s);\n", expr_buf);
    } else {
        snprintf(c_line, sizeof(c_line), "printf(\"%%d\\n\", %s);\n", expr_buf);
    }
    emit_c(cg, "%s", c_line);
}

// Helper to emit C code (append to output buffer or file)
void emit_c(Codegen *cg, const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(cg->out, fmt, args);
    va_end(args);
    // No debug output here; only write to output file
}

// Minimal stub for generating C code for an expression
void gen_c_expr(Codegen *cg, ASTNode *expr, char *buf, size_t buflen) {
    // For now, just handle literals and variable names
    switch (expr->type) {
        case NODE_INT_LITERAL:
            snprintf(buf, buflen, "%d", expr->data.int_literal.value);
            break;
        case NODE_STRING_LITERAL:
            snprintf(buf, buflen, "\"%s\"", expr->data.string_literal.value);
            break;
        case NODE_IDENTIFIER:
            snprintf(buf, buflen, "%s", expr->data.identifier.name);
            break;
        default:
            snprintf(buf, buflen, "/* unsupported expr */");
    }
}
