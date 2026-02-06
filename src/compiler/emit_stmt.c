#include "compiler/emit.h"
#include "compiler/codegen_ctx.h"

static void push_try(Codegen *cg, int catch_label, int finally_label, int has_catch) {
    if (cg->try_depth >= MAX_TRY_DEPTH) {
        set_error(cg, NULL, "Too many nested try blocks");
        return;
    }
    cg->try_catch_labels[cg->try_depth] = catch_label;
    cg->try_finally_labels[cg->try_depth] = finally_label;
    cg->try_has_catch[cg->try_depth] = has_catch;
    cg->try_depth += 1;
}

static void pop_try(Codegen *cg) {
    if (cg->try_depth > 0) {
        cg->try_depth -= 1;
    }
}

static int current_handler_label(Codegen *cg) {
    if (cg->try_depth <= 0) return -1;
    int idx = cg->try_depth - 1;
    if (cg->try_has_catch[idx]) return cg->try_catch_labels[idx];
    return cg->try_finally_labels[idx];
}

static int outer_handler_label(Codegen *cg) {
    if (cg->try_depth <= 1) return -1;
    int idx = cg->try_depth - 2;
    if (cg->try_has_catch[idx]) return cg->try_catch_labels[idx];
    return cg->try_finally_labels[idx];
}

void gen_print(Codegen *cg, ASTNode *node) {
    VarType print_type = expr_is_string(cg, node->data.print_stmt.value);
    gen_expr(cg, node->data.print_stmt.value);
    emit(cg, "    mov rsi, rax\n");

    if (print_type == TYPE_STRING) {
        emit(cg, "    mov rdi, rsi\n");
        emit(cg, "    xor eax, eax\n");
        emit(cg, "    call puts@PLT\n");
    } else {
        emit(cg, "    lea rdi, [rip + .LC0]\n");
        emit(cg, "    xor eax, eax\n");
        emit(cg, "    call printf@PLT\n");
    }
}

void gen_stmt(Codegen *cg, ASTNode *node) {
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
                VarType init_type = expr_is_string(cg, node->data.var_decl.value);
                set_local_type(cg, node->data.var_decl.name, init_type);
                gen_expr(cg, node->data.var_decl.value);
                emit(cg, "    mov QWORD PTR [rbp-%d], rax\n", cg->locals[idx].offset);
            } else {
                set_local_type(cg, node->data.var_decl.name, TYPE_INT);
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
            VarType assign_type = expr_is_string(cg, node->data.assignment.value);
            set_local_type(cg, node->data.assignment.name, assign_type);
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
            return;
        case NODE_INT_LITERAL:
        case NODE_STRING_LITERAL:
        case NODE_BOOL_LITERAL:
        case NODE_ARRAY_LITERAL:
        case NODE_ARRAY_INDEX:
        case NODE_IDENTIFIER:
        case NODE_BINARY_OP:
        case NODE_UNARY_OP:
        case NODE_CALL:
            gen_expr(cg, node);
            return;
        case NODE_THROW:
        {
            int label_id = add_string(cg, node->data.throw_stmt.message);
            if (label_id < 0) {
                set_error(cg, node, "Too many string literals");
                return;
            }
            emit(cg, "    lea rax, [rip + .LC%d]\n", label_id);
            emit(cg, "    mov QWORD PTR [rip + yap_err_msg], rax\n");
            emit(cg, "    mov DWORD PTR [rip + yap_err_line], %d\n", node->line);
            emit(cg, "    mov DWORD PTR [rip + yap_err_col], %d\n", node->column);
            emit(cg, "    mov DWORD PTR [rip + yap_err_flag], 1\n");

            int handler = current_handler_label(cg);
            if (handler >= 0) {
                emit(cg, "    jmp .L%d\n", handler);
            } else {
                emit(cg, "    call yap_unhandled\n");
            }
            return;
        }
        case NODE_TRY:
        {
            int has_catch = node->data.try_stmt.catch_block != NULL;
            int has_finally = node->data.try_stmt.finally_block != NULL;

            int catch_label = has_catch ? get_label(cg) : -1;
            int finally_label = has_finally ? get_label(cg) : -1;
            int end_label = get_label(cg);

            if (cg->has_error) return;

            emit(cg, "    mov DWORD PTR [rip + yap_err_flag], 0\n");
            push_try(cg, catch_label, finally_label, has_catch);
            gen_stmt(cg, node->data.try_stmt.try_block);
            pop_try(cg);

            if (has_finally) {
                emit(cg, "    jmp .L%d\n", finally_label);
            } else {
                emit(cg, "    jmp .L%d\n", end_label);
            }

            if (has_catch) {
                emit(cg, ".L%d:\n", catch_label);
                if (node->data.try_stmt.catch_name) {
                    int idx = find_local(cg, node->data.try_stmt.catch_name);
                    if (idx < 0) {
                        idx = add_local(cg, node->data.try_stmt.catch_name);
                    }
                    set_local_type(cg, node->data.try_stmt.catch_name, TYPE_STRING);
                    emit(cg, "    mov rax, QWORD PTR [rip + yap_err_msg]\n");
                    emit(cg, "    mov QWORD PTR [rbp-%d], rax\n", cg->locals[idx].offset);
                }
                emit(cg, "    mov DWORD PTR [rip + yap_err_flag], 0\n");
                gen_stmt(cg, node->data.try_stmt.catch_block);
                if (has_finally) {
                    emit(cg, "    jmp .L%d\n", finally_label);
                } else {
                    emit(cg, "    jmp .L%d\n", end_label);
                }
            }

            if (has_finally) {
                emit(cg, ".L%d:\n", finally_label);
                gen_stmt(cg, node->data.try_stmt.finally_block);

                emit(cg, "    cmp DWORD PTR [rip + yap_err_flag], 0\n");
                emit(cg, "    je .L%d\n", end_label);
                int outer = outer_handler_label(cg);
                if (outer >= 0) {
                    emit(cg, "    jmp .L%d\n", outer);
                } else {
                    emit(cg, "    call yap_unhandled\n");
                }
            }

            emit(cg, ".L%d:\n", end_label);
            return;
        }
        default:
            set_error(cg, node, "Unsupported statement node");
            return;
    }
}
