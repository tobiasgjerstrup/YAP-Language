#include "compiler.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#define MAX_LOCALS 256
#define MAX_LABELS 1024

typedef struct {
    char *name;
    int offset;
} Local;

typedef struct {
    FILE *out;
    Local locals[MAX_LOCALS];
    int local_count;
    int label_counter;
    int stack_size;
    char error[256];
    int has_error;
} Codegen;

static void set_error(Codegen *cg, ASTNode *node, const char *fmt, ...) {
    if (cg->has_error) return;
    va_list args;
    va_start(args, fmt);
    if (node && node->line > 0) {
        char msg[192];
        vsnprintf(msg, sizeof(msg), fmt, args);
        snprintf(cg->error, sizeof(cg->error), "Line %d:%d: %s", node->line, node->column, msg);
    } else {
        vsnprintf(cg->error, sizeof(cg->error), fmt, args);
    }
    va_end(args);
    cg->has_error = 1;
}

static void emit(Codegen *cg, const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(cg->out, fmt, args);
    va_end(args);
}

static int find_local(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->local_count; i++) {
        if (strcmp(cg->locals[i].name, name) == 0) return i;
    }
    return -1;
}

static int add_local(Codegen *cg, const char *name) {
    int existing = find_local(cg, name);
    if (existing >= 0) return existing;
    if (cg->local_count >= MAX_LOCALS) return -1;
    cg->locals[cg->local_count].name = malloc(strlen(name) + 1);
    strcpy(cg->locals[cg->local_count].name, name);
    cg->locals[cg->local_count].offset = (cg->local_count + 1) * 8;
    return cg->local_count++;
}

static void free_locals(Codegen *cg) {
    for (int i = 0; i < cg->local_count; i++) {
        free(cg->locals[i].name);
    }
}

static void prepass_locals(Codegen *cg, ASTNode *node) {
    if (!node) return;
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                prepass_locals(cg, node->statements[i]);
            }
            break;
        case NODE_VAR_DECL:
            add_local(cg, node->data.var_decl.name);
            break;
        default:
            break;
    }
}

static void gen_expr(Codegen *cg, ASTNode *node);
static void gen_stmt(Codegen *cg, ASTNode *node);

static void gen_binary_op(Codegen *cg, ASTNode *node) {
    const char *op = node->data.binary_op.op;
    gen_expr(cg, node->data.binary_op.left);
    emit(cg, "    push rax\n");
    gen_expr(cg, node->data.binary_op.right);
    emit(cg, "    pop rcx\n");

    if (strcmp(op, "+") == 0) {
        emit(cg, "    add rax, rcx\n");
        return;
    }

    if (strcmp(op, "-") == 0) {
        emit(cg, "    sub rcx, rax\n");
        emit(cg, "    mov rax, rcx\n");
        return;
    }

    if (strcmp(op, "*") == 0) {
        emit(cg, "    imul rax, rcx\n");
        return;
    }

    if (strcmp(op, "/") == 0 || strcmp(op, "%") == 0) {
        emit(cg, "    mov rdx, rax\n");
        emit(cg, "    mov rax, rcx\n");
        emit(cg, "    mov rcx, rdx\n");
        emit(cg, "    cqo\n");
        emit(cg, "    idiv rcx\n");
        if (strcmp(op, "%") == 0) {
            emit(cg, "    mov rax, rdx\n");
        }
        return;
    }

    if (strcmp(op, "<") == 0 || strcmp(op, "<=") == 0 ||
        strcmp(op, ">") == 0 || strcmp(op, ">=") == 0 ||
        strcmp(op, "==") == 0 || strcmp(op, "!=") == 0) {
        emit(cg, "    cmp rcx, rax\n");
        if (strcmp(op, "<") == 0) {
            emit(cg, "    setl al\n");
        } else if (strcmp(op, "<=") == 0) {
            emit(cg, "    setle al\n");
        } else if (strcmp(op, ">") == 0) {
            emit(cg, "    setg al\n");
        } else if (strcmp(op, ">=") == 0) {
            emit(cg, "    setge al\n");
        } else if (strcmp(op, "==") == 0) {
            emit(cg, "    sete al\n");
        } else {
            emit(cg, "    setne al\n");
        }
        emit(cg, "    movzx rax, al\n");
        return;
    }

    set_error(cg, node, "Unsupported binary operator '%s'", op);
}

static void gen_expr(Codegen *cg, ASTNode *node) {
    if (cg->has_error) return;
    if (!node) {
        emit(cg, "    xor rax, rax\n");
        return;
    }

    switch (node->type) {
        case NODE_INT_LITERAL:
            emit(cg, "    mov rax, %d\n", node->data.int_literal.value);
            return;
        case NODE_STRING_LITERAL:
            set_error(cg, node, "String literals are not supported in native compile yet");
            return;
        case NODE_BOOL_LITERAL:
            set_error(cg, node, "Boolean literals are not supported in native compile yet");
            return;
        case NODE_IDENTIFIER: {
            int idx = find_local(cg, node->data.identifier.name);
            if (idx < 0) {
                set_error(cg, node, "Undefined variable '%s'", node->data.identifier.name);
                return;
            }
            emit(cg, "    mov rax, QWORD PTR [rbp-%d]\n", cg->locals[idx].offset);
            return;
        }
        case NODE_BINARY_OP:
            gen_binary_op(cg, node);
            return;
        case NODE_UNARY_OP:
            gen_expr(cg, node->data.unary_op.operand);
            if (strcmp(node->data.unary_op.op, "-") == 0) {
                emit(cg, "    neg rax\n");
                return;
            }
            if (strcmp(node->data.unary_op.op, "!") == 0) {
                emit(cg, "    cmp rax, 0\n");
                emit(cg, "    sete al\n");
                emit(cg, "    movzx rax, al\n");
                return;
            }
            set_error(cg, node, "Unsupported unary operator '%s'", node->data.unary_op.op);
            return;
        default:
            set_error(cg, node, "Unsupported expression node");
            return;
    }
}

static void gen_print(Codegen *cg, ASTNode *node) {
    gen_expr(cg, node->data.print_stmt.value);
    emit(cg, "    mov rsi, rax\n");
    emit(cg, "    lea rdi, [rip + .LC0]\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call printf@PLT\n");
}

static void gen_stmt(Codegen *cg, ASTNode *node) {
    if (cg->has_error || !node) return;
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                gen_stmt(cg, node->statements[i]);
            }
            return;
        case NODE_IF_STMT:
            set_error(cg, node, "If statements are not supported in native compile yet");
            return;
        case NODE_WHILE_STMT:
            set_error(cg, node, "While loops are not supported in native compile yet");
            return;
        case NODE_FUNC_DECL:
            set_error(cg, node, "Functions are not supported in native compile yet");
            return;
        case NODE_RETURN_STMT:
            set_error(cg, node, "Return statements are not supported in native compile yet");
            return;
        case NODE_CALL:
            set_error(cg, node, "Function calls are not supported in native compile yet");
            return;
        case NODE_VAR_DECL: {
            int idx = find_local(cg, node->data.var_decl.name);
            if (idx < 0) {
                set_error(cg, node, "Internal error: missing variable '%s'", node->data.var_decl.name);
                return;
            }
            if (node->data.var_decl.value) {
                gen_expr(cg, node->data.var_decl.value);
                emit(cg, "    mov QWORD PTR [rbp-%d], rax\n", cg->locals[idx].offset);
            } else {
                emit(cg, "    mov QWORD PTR [rbp-%d], 0\n", cg->locals[idx].offset);
            }
            return;
        }
        case NODE_ASSIGNMENT: {
            int idx = find_local(cg, node->data.assignment.name);
            if (idx < 0) {
                set_error(cg, node, "Undefined variable '%s'", node->data.assignment.name);
                return;
            }
            gen_expr(cg, node->data.assignment.value);
            emit(cg, "    mov QWORD PTR [rbp-%d], rax\n", cg->locals[idx].offset);
            return;
        }
        case NODE_PRINT_STMT:
            gen_print(cg, node);
            return;
        case NODE_INT_LITERAL:
        case NODE_STRING_LITERAL:
        case NODE_BOOL_LITERAL:
        case NODE_IDENTIFIER:
        case NODE_BINARY_OP:
        case NODE_UNARY_OP:
            gen_expr(cg, node);
            return;
        default:
            set_error(cg, node, "Unsupported statement node");
            return;
    }
}

static int emit_assembly(Codegen *cg, ASTNode *program, const char *asm_path) {
    cg->out = fopen(asm_path, "w");
    if (!cg->out) {
        set_error(cg, NULL, "Failed to open output file '%s'", asm_path);
        return 1;
    }

    emit(cg, ".intel_syntax noprefix\n");
    emit(cg, ".section .rodata\n");
    emit(cg, ".LC0:\n");
    emit(cg, "    .string \"%%ld\\n\"\n");
    emit(cg, ".text\n");
    emit(cg, ".globl main\n");
    emit(cg, ".type main, @function\n");
    emit(cg, "main:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");

    int raw_stack = cg->local_count * 8;
    cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
    if (cg->stack_size > 0) {
        emit(cg, "    sub rsp, %d\n", cg->stack_size);
    }

    gen_stmt(cg, program);

    emit(cg, "    mov eax, 0\n");
    emit(cg, "    leave\n");
    emit(cg, "    ret\n");

    emit(cg, ".section .note.GNU-stack,\"\",@progbits\n");

    fclose(cg->out);
    cg->out = NULL;

    return cg->has_error ? 1 : 0;
}

int compiler_compile(ASTNode *program, const char *output_path, char *error, size_t error_size) {
    if (!program) {
        if (error && error_size) {
            snprintf(error, error_size, "No program to compile");
        }
        return 1;
    }

    const char *out_path = output_path ? output_path : "a.out";
    char asm_path[512];
    snprintf(asm_path, sizeof(asm_path), "%s.s", out_path);

    Codegen cg;
    memset(&cg, 0, sizeof(cg));

    prepass_locals(&cg, program);
    if (cg.local_count >= MAX_LOCALS) {
        if (error && error_size) {
            snprintf(error, error_size, "Too many local variables");
        }
        free_locals(&cg);
        return 1;
    }

    if (emit_assembly(&cg, program, asm_path) != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        free_locals(&cg);
        return 1;
    }

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "gcc -no-pie -o %s %s", out_path, asm_path);
    int rc = system(cmd);

    free_locals(&cg);

    if (rc != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "Toolchain failed while linking %s", out_path);
        }
        return 1;
    }

    return 0;
}
