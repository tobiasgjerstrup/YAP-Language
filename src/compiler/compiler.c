
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "compiler/compiler.h"
#include "compiler/analysis.h"
#include "compiler/emit.h"
#include "compiler/emit_runtime.h"
#include "compiler/codegen_ctx.h"
#include "ast.h"

// Example stub for transpiling print statements to C
void transpile_stmt_to_c(Codegen *cg, ASTNode *node) {
    if (!node) return;
    switch (node->type) {
        case NODE_FUNC_DECL: {
            // Emit function signature
            emit_c(cg, "int %s(", node->data.func_decl.name);
            for (int i = 0; i < node->data.func_decl.param_count; i++) {
                emit_c(cg, "int %s%s", node->data.func_decl.params[i], (i < node->data.func_decl.param_count - 1) ? ", " : "");
            }
            emit_c(cg, ") {\n");
            transpile_stmt_to_c(cg, node->data.func_decl.body);
            emit_c(cg, "}\n");
            break;
        }
        case NODE_RETURN_STMT: {
            char expr_buf[256];
            gen_c_expr(cg, node->data.return_stmt.value, expr_buf, sizeof(expr_buf));
            emit_c(cg, "return %s;\n", expr_buf);
            break;
        }
        case NODE_CALL: {
            // Only support calls as statements for now
            emit_c(cg, "%s(", node->data.call.name);
            for (int i = 0; i < node->data.call.arg_count; i++) {
                char arg_buf[128];
                gen_c_expr(cg, node->data.call.args[i], arg_buf, sizeof(arg_buf));
                emit_c(cg, "%s%s", arg_buf, (i < node->data.call.arg_count - 1) ? ", " : "");
            }
            emit_c(cg, ");\n");
            break;
        }
        case NODE_WHILE_STMT: {
            char cond_buf[256];
            gen_c_expr(cg, node->data.while_stmt.condition, cond_buf, sizeof(cond_buf));
            emit_c(cg, "while (%s) {\n", cond_buf);
            if (node->data.while_stmt.body->type == NODE_BLOCK) {
                transpile_stmt_to_c(cg, node->data.while_stmt.body);
            } else {
                transpile_stmt_to_c(cg, node->data.while_stmt.body);
            }
            emit_c(cg, "}\n");
            break;
        }
                case NODE_BLOCK:
                    for (int i = 0; i < node->statement_count; i++) {
                        transpile_stmt_to_c(cg, node->statements[i]);
                    }
                    break;
        case NODE_PRINT_STMT:
            emit_c_print(cg, node);
            break;
        case NODE_VAR_DECL:
            emit_c_var_decl(cg, node);
            break;
        case NODE_ASSIGNMENT:
            emit_c_assignment(cg, node);
            break;
        case NODE_IF_STMT: {
            char cond_buf[256];
            gen_c_expr(cg, node->data.if_stmt.condition, cond_buf, sizeof(cond_buf));
            emit_c(cg, "if (%s) {\n", cond_buf);
            if (node->data.if_stmt.then_branch->type == NODE_BLOCK) {
                transpile_stmt_to_c(cg, node->data.if_stmt.then_branch);
            } else {
                transpile_stmt_to_c(cg, node->data.if_stmt.then_branch);
            }
            emit_c(cg, "}\n");
            if (node->data.if_stmt.else_branch) {
                emit_c(cg, "else {\n");
                if (node->data.if_stmt.else_branch->type == NODE_BLOCK) {
                    transpile_stmt_to_c(cg, node->data.if_stmt.else_branch);
                } else {
                    transpile_stmt_to_c(cg, node->data.if_stmt.else_branch);
                }
                emit_c(cg, "}\n");
            }
            break;
        }
        default:
            // Not implemented
            break;
    }
}

// Transpile a YAP program to C (minimal: only print statements)
int compiler_transpile_to_c(ASTNode *program, const char *output_path, char *error, size_t error_size) {
    FILE *out = fopen(output_path ? output_path : "out.c", "w");
    if (!out) {
        if (error && error_size) snprintf(error, error_size, "Failed to open output file '%s'", output_path);
        return 1;
    }
    fprintf(out, "#include <stdio.h>\n\n");
    Codegen cg = {0};
    cg.out = out;
    // Emit all function definitions first
    for (int i = 0; i < program->statement_count; i++) {
        ASTNode *stmt = program->statements[i];
        if (stmt && stmt->type == NODE_FUNC_DECL) {
            transpile_stmt_to_c(&cg, stmt);
        }
    }
    // Emit main function and all non-function statements
    fprintf(out, "int main() {\n");
    for (int i = 0; i < program->statement_count; i++) {
        ASTNode *stmt = program->statements[i];
        if (!stmt || stmt->type == NODE_FUNC_DECL) continue;
        transpile_stmt_to_c(&cg, stmt);
    }
    fprintf(out, "    return 0;\n}\n");
    fclose(out);
    return 0;
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
    emit_runtime_helpers(cg);

    for (int i = 0; i < cg->function_count; i++) {
        FunctionDef *func = &cg->functions[i];
        free_locals(cg);

        for (int j = 0; j < func->param_count; j++) {
            add_local(cg, func->params[j]);
        }

        if (func->param_types) {
            for (int j = 0; j < func->param_count; j++) {
                set_local_type(cg, func->params[j], func->param_types[j]);
            }
        }

        collect_locals(cg, func->body);

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

    emit(cg, "\n.globl main\n");
    emit(cg, ".type main, @function\n");
    emit(cg, "main:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");

    free_locals(cg);

    int args_idx = add_local(cg, "args");
    if (args_idx < 0) {
        set_error(cg, NULL, "Too many locals");
        fclose(cg->out);
        cg->out = NULL;
        return 1;
    }
    set_local_type(cg, "args", TYPE_ARRAY);

    collect_locals(cg, program);

    int raw_stack = cg->local_count * 8;
    cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
    if (cg->stack_size > 0) {
        emit(cg, "    sub rsp, %d\n", cg->stack_size);
    }

    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call yap_build_args\n");
    emit(cg, "    mov QWORD PTR [rbp-%d], rax\n", cg->locals[args_idx].offset);

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
#ifdef _WIN32
    if (error && error_size) {
        snprintf(error, error_size, "Compile mode is not supported on Windows yet. Use interpreter mode instead.");
    }
    return 1;
#endif
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
    cg.label_counter = 1;

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

    int changed = 0;
    do {
        changed = 0;
        infer_param_types(&cg, program, NULL, &changed);
    } while (changed);

    if (emit_assembly(&cg, program, asm_path) != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "gcc -no-pie -o %s %s src/compiler/runtime_sqlite.c -lsqlite3", out_path, asm_path);
    int rc = system(cmd);

    if (rc != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "Toolchain failed while linking %s", out_path);
        }
        return 1;
    }

    return 0;
}
