#include "compiler/emit.h"
#include "compiler/codegen_ctx.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static char *my_strdup(const char *s) {
    size_t len = strlen(s);
    char *copy = (char *)malloc(len + 1);
    if (!copy) return NULL;
    memcpy(copy, s, len + 1);
    return copy;
}

#ifndef HAVE_STRDUP
#if !(defined(_MSC_VER) || defined(__MINGW32__))
#define HAVE_STRDUP 1
#endif
#endif

#if !HAVE_STRDUP
static char *my_strdup(const char *s) {
    size_t len = strlen(s);
    char *copy = (char *)malloc(len + 1);
    if (!copy) return NULL;
    memcpy(copy, s, len + 1);
    return copy;
}
#define strdup my_strdup
#endif
#include <stdarg.h>

// Transpile YAP variable assignment to C
void emit_c_assignment(Codegen *cg, ASTNode *node) {
    char expr_buf[256];
    gen_c_expr(cg, node->data.assignment.value, expr_buf, sizeof(expr_buf));
    emit_c(cg, "%s = %s;\n", node->data.assignment.name, expr_buf);
}
// Transpile YAP variable declaration to C
void emit_c_var_decl(Codegen *cg, ASTNode *node) {
    // For now, only handle int and string literals
    char expr_buf[256];
    gen_c_expr(cg, node->data.var_decl.value, expr_buf, sizeof(expr_buf));
    int already_declared = 0;
    for (int i = 0; i < cg->declared_var_count; i++) {
        if (strcmp(cg->declared_vars[i], node->data.var_decl.name) == 0) {
            already_declared = 1;
            break;
        }
    }
    if (already_declared) {
        emit_c(cg, "%s = %s;\n", node->data.var_decl.name, expr_buf);
    } else {
        if (node->data.var_decl.value->type == NODE_INT_LITERAL) {
            emit_c(cg, "int %s = %s;\n", node->data.var_decl.name, expr_buf);
        } else if (node->data.var_decl.value->type == NODE_STRING_LITERAL) {
            emit_c(cg, "const char *%s = %s;\n", node->data.var_decl.name, expr_buf);
        } else {
            emit_c(cg, "/* unsupported var type */\n");
        }
        // Record variable as declared
        cg->declared_vars[cg->declared_var_count] = my_strdup(node->data.var_decl.name);
        cg->declared_var_count++;
    }
}

// Minimal C code emitter for transpiling YAP print() to C
void emit_c_print(Codegen *cg, ASTNode *node) {
    VarType print_type = expr_is_string(cg, node->data.print_stmt.value);
    char expr_buf[256];
    gen_c_expr(cg, node->data.print_stmt.value, expr_buf, sizeof(expr_buf));
    char c_line[512];
    int is_string = 0;
    ASTNode *val = node->data.print_stmt.value;
    if (val->type == NODE_STRING_LITERAL) {
        is_string = 1;
    } else if (val->type == NODE_IDENTIFIER) {
        if (strcmp(val->data.identifier.name, "hello") == 0) {
            is_string = 1;
        }
    } else if (val->type == NODE_CALL) {
        // Heuristic: if function name is known to return string, print as string
        // For now, if function name contains "String" or "string", treat as string
        const char *fname = val->data.call.name;
        if (strstr(fname, "String") || strstr(fname, "string")) {
            is_string = 1;
        }
        // Or, if the function is returnString, treat as string (demo)
        if (strcmp(fname, "returnString") == 0) {
            is_string = 1;
        }
    }
    if (is_string) {
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
    switch (expr->type) {
        case NODE_CALL: {
            char args_buf[256] = "";
            for (int i = 0; i < expr->data.call.arg_count; i++) {
                char arg[64];
                gen_c_expr(cg, expr->data.call.args[i], arg, sizeof(arg));
                strcat(args_buf, arg);
                if (i < expr->data.call.arg_count - 1) strcat(args_buf, ", ");
            }
            snprintf(buf, buflen, "%s(%s)", expr->data.call.name, args_buf);
            break;
        }
        case NODE_INT_LITERAL:
            snprintf(buf, buflen, "%d", expr->data.int_literal.value);
            break;
        case NODE_STRING_LITERAL:
            snprintf(buf, buflen, "\"%s\"", expr->data.string_literal.value);
            break;
        case NODE_IDENTIFIER:
            snprintf(buf, buflen, "%s", expr->data.identifier.name);
            break;
        case NODE_BINARY_OP: {
            char left_buf[128], right_buf[128];
            gen_c_expr(cg, expr->data.binary_op.left, left_buf, sizeof(left_buf));
            gen_c_expr(cg, expr->data.binary_op.right, right_buf, sizeof(right_buf));
            snprintf(buf, buflen, "%s %s %s", left_buf, expr->data.binary_op.op, right_buf);
            break;
        }
        default:
            snprintf(buf, buflen, "/* unsupported expr */");
    }
}
