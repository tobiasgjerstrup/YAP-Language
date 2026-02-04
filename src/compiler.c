#include "compiler.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#define MAX_LOCALS 256
#define MAX_LABELS 1024
#define MAX_FUNCTIONS 256
#define MAX_STRINGS 256

typedef struct {
    char *name;
    int offset;
} Local;

typedef struct {
    char *name;
    ASTNode *body;
    char **params;
    int param_count;
} FunctionDef;

typedef struct {
    char *value;
    int label_id;
} StringConstant;

typedef struct {
    FILE *out;
    Local locals[MAX_LOCALS];
    int local_count;
    int label_counter;
    int stack_size;
    char error[256];
    int has_error;
    FunctionDef functions[MAX_FUNCTIONS];
    int function_count;
    StringConstant strings[MAX_STRINGS];
    int string_count;
    const char *current_function_name;
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

static int get_label(Codegen *cg) {
    if (cg->label_counter >= MAX_LABELS - 1) {
        set_error(cg, NULL, "Too many labels");
        return -1;
    }
    return cg->label_counter++;
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
    cg->local_count = 0;
}

static FunctionDef* find_function(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->function_count; i++) {
        if (strcmp(cg->functions[i].name, name) == 0) {
            return &cg->functions[i];
        }
    }
    return NULL;
}

static int find_string(Codegen *cg, const char *value) {
    for (int i = 0; i < cg->string_count; i++) {
        if (strcmp(cg->strings[i].value, value) == 0) {
            return cg->strings[i].label_id;
        }
    }
    return -1;
}

static int add_string(Codegen *cg, const char *value) {
    int existing = find_string(cg, value);
    if (existing >= 0) return existing;
    if (cg->string_count >= MAX_STRINGS) return -1;
    cg->strings[cg->string_count].value = malloc(strlen(value) + 1);
    strcpy(cg->strings[cg->string_count].value, value);
    cg->strings[cg->string_count].label_id = get_label(cg);
    return cg->strings[cg->string_count++].label_id;
}

static void prepass_strings(Codegen *cg, ASTNode *node) {
    if (!node || cg->has_error) return;
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                prepass_strings(cg, node->statements[i]);
            }
            break;
        case NODE_STRING_LITERAL:
            add_string(cg, node->data.string_literal.value);
            break;
        case NODE_VAR_DECL:
            prepass_strings(cg, node->data.var_decl.value);
            break;
        case NODE_ASSIGNMENT:
            prepass_strings(cg, node->data.assignment.value);
            break;
        case NODE_PRINT_STMT:
            prepass_strings(cg, node->data.print_stmt.value);
            break;
        case NODE_IF_STMT:
            prepass_strings(cg, node->data.if_stmt.condition);
            prepass_strings(cg, node->data.if_stmt.then_branch);
            prepass_strings(cg, node->data.if_stmt.else_branch);
            break;
        case NODE_WHILE_STMT:
            prepass_strings(cg, node->data.while_stmt.condition);
            prepass_strings(cg, node->data.while_stmt.body);
            break;
        case NODE_RETURN_STMT:
            prepass_strings(cg, node->data.return_stmt.value);
            break;
        case NODE_FUNC_DECL:
            prepass_strings(cg, node->data.func_decl.body);
            break;
        case NODE_BINARY_OP:
            prepass_strings(cg, node->data.binary_op.left);
            prepass_strings(cg, node->data.binary_op.right);
            break;
        case NODE_UNARY_OP:
            prepass_strings(cg, node->data.unary_op.operand);
            break;
        case NODE_CALL:
            for (int i = 0; i < node->data.call.arg_count; i++) {
                prepass_strings(cg, node->data.call.args[i]);
            }
            break;
        default:
            break;
    }
}

static void prepass_functions(Codegen *cg, ASTNode *node) {
    if (!node) return;
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                prepass_functions(cg, node->statements[i]);
            }
            break;
        case NODE_FUNC_DECL:
            if (cg->function_count >= MAX_FUNCTIONS) {
                set_error(cg, node, "Too many functions");
                return;
            }
            cg->functions[cg->function_count].name = malloc(strlen(node->data.func_decl.name) + 1);
            strcpy(cg->functions[cg->function_count].name, node->data.func_decl.name);
            cg->functions[cg->function_count].body = node->data.func_decl.body;
            cg->functions[cg->function_count].param_count = node->data.func_decl.param_count;
            if (node->data.func_decl.param_count > 0) {
                cg->functions[cg->function_count].params = malloc(sizeof(char*) * node->data.func_decl.param_count);
                for (int i = 0; i < node->data.func_decl.param_count; i++) {
                    cg->functions[cg->function_count].params[i] = malloc(strlen(node->data.func_decl.params[i]) + 1);
                    strcpy(cg->functions[cg->function_count].params[i], node->data.func_decl.params[i]);
                }
            }
            cg->function_count++;
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
        case NODE_STRING_LITERAL: {
            int label_id = add_string(cg, node->data.string_literal.value);
            if (label_id < 0) {
                set_error(cg, node, "Too many string literals");
                return;
            }
            emit(cg, "    lea rax, [rip + .LC%d]\n", label_id);
            return;
        }
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
        case NODE_CALL: {
            FunctionDef *func = find_function(cg, node->data.call.name);
            if (!func) {
                set_error(cg, node, "Undefined function '%s'", node->data.call.name);
                return;
            }
            if (node->data.call.arg_count != func->param_count) {
                set_error(cg, node, "Function '%s' expects %d args, got %d",
                         node->data.call.name, func->param_count, node->data.call.arg_count);
                return;
            }
            // SysV ABI: rdi, rsi, rdx, rcx, r8, r9
            static const char *arg_regs[] = {"rdi", "rsi", "rdx", "rcx", "r8", "r9"};
            for (int i = 0; i < node->data.call.arg_count; i++) {
                gen_expr(cg, node->data.call.args[i]);
                if (i < 6) {
                    emit(cg, "    mov %s, rax\n", arg_regs[i]);
                } else {
                    emit(cg, "    push rax\n");
                }
            }
            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call %s\n", node->data.call.name);
            return;
        }
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
        case NODE_IF_STMT: {
            int false_label = get_label(cg);
            int end_label = get_label(cg);
            gen_expr(cg, node->data.if_stmt.condition);
            emit(cg, "    cmp rax, 0\n");
            emit(cg, "    je .L%d\n", false_label);
            gen_stmt(cg, node->data.if_stmt.then_branch);
            emit(cg, "    jmp .L%d\n", end_label);
            emit(cg, ".L%d:\n", false_label);
            if (node->data.if_stmt.else_branch) {
                gen_stmt(cg, node->data.if_stmt.else_branch);
            }
            emit(cg, ".L%d:\n", end_label);
            return;
        }
        case NODE_WHILE_STMT: {
            int loop_label = get_label(cg);
            int end_label = get_label(cg);
            emit(cg, ".L%d:\n", loop_label);
            gen_expr(cg, node->data.while_stmt.condition);
            emit(cg, "    cmp rax, 0\n");
            emit(cg, "    je .L%d\n", end_label);
            gen_stmt(cg, node->data.while_stmt.body);
            emit(cg, "    jmp .L%d\n", loop_label);
            emit(cg, ".L%d:\n", end_label);
            return;
        }
        case NODE_RETURN_STMT:
            if (node->data.return_stmt.value) {
                gen_expr(cg, node->data.return_stmt.value);
            } else {
                emit(cg, "    xor eax, eax\n");
            }
            emit(cg, "    jmp .%s_ret\n", cg->current_function_name);
            return;
        case NODE_FUNC_DECL:
            // Function declarations are handled separately
            return;
        case NODE_INT_LITERAL:
        case NODE_STRING_LITERAL:
        case NODE_BOOL_LITERAL:
        case NODE_IDENTIFIER:
        case NODE_BINARY_OP:
        case NODE_UNARY_OP:
        case NODE_CALL:
            gen_expr(cg, node);
            return;
        default:
            set_error(cg, node, "Unsupported statement node");
            return;
    }
}

static void emit_string_section(Codegen *cg) {
    emit(cg, ".section .rodata\n");
    emit(cg, ".LC0:\n");
    emit(cg, "    .string \"%%ld\\n\"\n");
    for (int i = 0; i < cg->string_count; i++) {
        emit(cg, ".LC%d:\n", cg->strings[i].label_id);
        emit(cg, "    .string \"");
        for (const char *p = cg->strings[i].value; *p; p++) {
            if (*p == '"') emit(cg, "\\\"");
            else if (*p == '\\') emit(cg, "\\\\");
            else if (*p == '\n') emit(cg, "\\n");
            else if (*p == '\t') emit(cg, "\\t");
            else emit(cg, "%c", *p);
        }
        emit(cg, "\"\n");
    }
}

static int emit_assembly(Codegen *cg, ASTNode *program, const char *asm_path) {
    cg->out = fopen(asm_path, "w");
    if (!cg->out) {
        set_error(cg, NULL, "Failed to open output file '%s'", asm_path);
        return 1;
    }

    emit(cg, ".intel_syntax noprefix\n");
    emit_string_section(cg);
    emit(cg, ".text\n");

    // Emit all function definitions FIRST
    for (int i = 0; i < cg->function_count; i++) {
        FunctionDef *func = &cg->functions[i];
        free_locals(cg);
        
        for (int j = 0; j < func->param_count; j++) {
            add_local(cg, func->params[j]);
        }

        emit(cg, ".globl %s\n", func->name);
        emit(cg, ".type %s, @function\n", func->name);
        emit(cg, "%s:\n", func->name);
        emit(cg, "    push rbp\n");
        emit(cg, "    mov rbp, rsp\n");

        int raw_stack = cg->local_count * 8;
        cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
        if (cg->stack_size > 0) {
            emit(cg, "    sub rsp, %d\n", cg->stack_size);
        }

        // Move arguments to stack
        static const char *arg_regs[] = {"rdi", "rsi", "rdx", "rcx", "r8", "r9"};
        for (int j = 0; j < func->param_count && j < 6; j++) {
            int idx = find_local(cg, func->params[j]);
            emit(cg, "    mov QWORD PTR [rbp-%d], %s\n", cg->locals[idx].offset, arg_regs[j]);
        }

        cg->current_function_name = func->name;
        gen_stmt(cg, func->body);
        
        emit(cg, ".%s_ret:\n", func->name);
        emit(cg, "    leave\n");
        emit(cg, "    ret\n\n");
    }

    // Now emit main
    emit(cg, ".globl main\n");
    emit(cg, ".type main, @function\n");
    emit(cg, "main:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");

    free_locals(cg);

    // Collect local variables for main
    for (int i = 0; i < program->statement_count; i++) {
        ASTNode *stmt = program->statements[i];
        if (stmt->type == NODE_VAR_DECL) {
            add_local(cg, stmt->data.var_decl.name);
        } else if (stmt->type == NODE_BLOCK) {
            for (int j = 0; j < stmt->statement_count; j++) {
                if (stmt->statements[j]->type == NODE_VAR_DECL) {
                    add_local(cg, stmt->statements[j]->data.var_decl.name);
                }
            }
        }
    }

    int raw_stack = cg->local_count * 8;
    cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
    if (cg->stack_size > 0) {
        emit(cg, "    sub rsp, %d\n", cg->stack_size);
    }

    cg->current_function_name = "main";
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
    cg.label_counter = 1;  // Reserve .LC0 for printf format string

    prepass_strings(&cg, program);
    if (cg.has_error) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    prepass_functions(&cg, program);
    if (cg.has_error) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    if (emit_assembly(&cg, program, asm_path) != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "gcc -no-pie -o %s %s", out_path, asm_path);
    int rc = system(cmd);

    if (rc != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "Toolchain failed while linking %s", out_path);
        }
        return 1;
    }

    return 0;
}
