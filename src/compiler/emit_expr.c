#include "compiler/emit.h"
#include "compiler/codegen_ctx.h"
#include <string.h>

static int current_handler_label(Codegen *cg) {
    if (cg->try_depth <= 0) return -1;
    int idx = cg->try_depth - 1;
    if (cg->try_has_catch[idx]) return cg->try_catch_labels[idx];
    return cg->try_finally_labels[idx];
}

static void emit_error_check(Codegen *cg) {
    emit(cg, "    cmp DWORD PTR [rip + yap_err_flag], 0\n");
    int handler = current_handler_label(cg);
    if (handler >= 0) {
        emit(cg, "    jne .L%d\n", handler);
    } else if (cg->current_function_name && strcmp(cg->current_function_name, "main") == 0) {
        int cont_label = get_label(cg);
        emit(cg, "    je .L%d\n", cont_label);
        emit(cg, "    call yap_unhandled\n");
        emit(cg, ".L%d:\n", cont_label);
    } else if (cg->current_function_name) {
        emit(cg, "    jne .%s_ret\n", cg->current_function_name);
    }
}

static void emit_array_len(Codegen *cg, const char *reg) {
    int zero_label = get_label(cg);
    int end_label = get_label(cg);
    emit(cg, "    cmp %s, 0\n", reg);
    emit(cg, "    je .L%d\n", zero_label);
    emit(cg, "    mov %s, QWORD PTR [%s]\n", reg, reg);
    emit(cg, "    jmp .L%d\n", end_label);
    emit(cg, ".L%d:\n", zero_label);
    emit(cg, "    mov %s, 0\n", reg);
    emit(cg, ".L%d:\n", end_label);
}

VarType expr_is_string(Codegen *cg, ASTNode *node) {
    if (!node) return TYPE_INT;
    if (node->type == NODE_STRING_LITERAL) return TYPE_STRING;
    if (node->type == NODE_BOOL_LITERAL) return TYPE_BOOL;
    if (node->type == NODE_ARRAY_LITERAL) return TYPE_ARRAY;
    if (node->type == NODE_ARRAY_INDEX) {
        if (node->data.array_index.array && node->data.array_index.array->type == NODE_IDENTIFIER) {
            if (strcmp(node->data.array_index.array->data.identifier.name, "args") == 0) {
                return TYPE_STRING;
            }
        }
        VarType arr_type = expr_is_string(cg, node->data.array_index.array);
        if (arr_type == TYPE_ARRAY2_STR) {
            return TYPE_ARRAY_STR;
        }
        if (arr_type == TYPE_ARRAY2) {
            return TYPE_ARRAY;
        }
        if (arr_type == TYPE_ARRAY_STR) {
            return TYPE_STRING;
        }
        return TYPE_INT;
    }
    if (node->type == NODE_IDENTIFIER) return get_local_type(cg, node->data.identifier.name);
    if (node->type == NODE_BINARY_OP) {
        const char *op = node->data.binary_op.op;
        if (strcmp(op, "<") == 0 || strcmp(op, "<=") == 0 ||
            strcmp(op, ">") == 0 || strcmp(op, ">=") == 0 ||
            strcmp(op, "==") == 0 || strcmp(op, "!=") == 0 ||
            strcmp(op, "&&") == 0 || strcmp(op, "||") == 0) {
            return TYPE_BOOL;
        }
        if (strcmp(op, "+") == 0) {
            VarType left_type = expr_is_string(cg, node->data.binary_op.left);
            VarType right_type = expr_is_string(cg, node->data.binary_op.right);
            if (left_type == TYPE_STRING || right_type == TYPE_STRING) {
                return TYPE_STRING;
            }
        }
    }
    if (node->type == NODE_UNARY_OP) {
        if (strcmp(node->data.unary_op.op, "!") == 0) {
            return TYPE_BOOL;
        }
    }
    if (node->type == NODE_CALL) {
        if (strcmp(node->data.call.name, "read") == 0) {
            return TYPE_STRING;
        }
        if (strcmp(node->data.call.name, "sqlite_query") == 0) {
            return TYPE_ARRAY2_STR;
        }
    }
    return TYPE_INT;
}

static void gen_binary_op(Codegen *cg, ASTNode *node) {
    const char *op = node->data.binary_op.op;
    VarType left_type = expr_is_string(cg, node->data.binary_op.left);
    VarType right_type = expr_is_string(cg, node->data.binary_op.right);

    if (strcmp(op, "&&") == 0) {
        gen_expr(cg, node->data.binary_op.left);
        emit(cg, "    cmp rax, 0\n");
        int false_label = get_label(cg);
        int end_label = get_label(cg);
        emit(cg, "    je .L%d\n", false_label);

        gen_expr(cg, node->data.binary_op.right);
        emit(cg, "    cmp rax, 0\n");
        emit(cg, "    setne al\n");
        emit(cg, "    movzx rax, al\n");
        emit(cg, "    jmp .L%d\n", end_label);

        emit(cg, ".L%d:\n", false_label);
        emit(cg, "    mov rax, 0\n");
        emit(cg, ".L%d:\n", end_label);
        return;
    }

    if (strcmp(op, "||") == 0) {
        gen_expr(cg, node->data.binary_op.left);
        emit(cg, "    cmp rax, 0\n");
        int true_label = get_label(cg);
        int end_label = get_label(cg);
        emit(cg, "    jne .L%d\n", true_label);

        gen_expr(cg, node->data.binary_op.right);
        emit(cg, "    cmp rax, 0\n");
        emit(cg, "    setne al\n");
        emit(cg, "    movzx rax, al\n");
        emit(cg, "    jmp .L%d\n", end_label);

        emit(cg, ".L%d:\n", true_label);
        emit(cg, "    mov rax, 1\n");
        emit(cg, ".L%d:\n", end_label);
        return;
    }

    gen_expr(cg, node->data.binary_op.left);
    emit(cg, "    push rax\n");
    gen_expr(cg, node->data.binary_op.right);
    emit(cg, "    pop rcx\n");

    if (strcmp(op, "+") == 0) {
        if (left_type == TYPE_STRING || right_type == TYPE_STRING) {
            if (left_type != TYPE_STRING) {
                if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
                    emit_array_len(cg, "rcx");
                }
                emit(cg, "    mov rdi, rcx\n");
                if (left_type == TYPE_BOOL) {
                    emit(cg, "    call yap_bool_to_string\n");
                } else {
                    emit(cg, "    call yap_int_to_string\n");
                }
                emit(cg, "    mov rcx, rax\n");
            }

            if (right_type != TYPE_STRING) {
                if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
                    emit_array_len(cg, "rax");
                }
                emit(cg, "    push rcx\n");
                emit(cg, "    mov rdi, rax\n");
                if (right_type == TYPE_BOOL) {
                    emit(cg, "    call yap_bool_to_string\n");
                } else {
                    emit(cg, "    call yap_int_to_string\n");
                }
                emit(cg, "    pop rcx\n");
            }

            emit(cg, "    mov rdi, rcx\n");
            emit(cg, "    mov rsi, rax\n");
            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call yap_concat_strings\n");
        } else {
            if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
                emit_array_len(cg, "rcx");
            }
            if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
                emit_array_len(cg, "rax");
            }
            emit(cg, "    add rax, rcx\n");
        }
        return;
    }

    if (strcmp(op, "-") == 0) {
        if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rcx");
        }
        if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rax");
        }
        emit(cg, "    sub rcx, rax\n");
        emit(cg, "    mov rax, rcx\n");
        return;
    }

    if (strcmp(op, "*") == 0) {
        if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rcx");
        }
        if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rax");
        }
        emit(cg, "    imul rax, rcx\n");
        return;
    }

    if (strcmp(op, "/") == 0 || strcmp(op, "%") == 0) {
        if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rcx");
        }
        if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rax");
        }
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
        if ((strcmp(op, "==") == 0 || strcmp(op, "!=") == 0) &&
            left_type == TYPE_STRING && right_type == TYPE_STRING) {
            emit(cg, "    mov rdi, rcx\n");
            emit(cg, "    mov rsi, rax\n");
            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call strcmp@PLT\n");
            emit(cg, "    cmp rax, 0\n");
            if (strcmp(op, "==") == 0) {
                emit(cg, "    sete al\n");
            } else {
                emit(cg, "    setne al\n");
            }
            emit(cg, "    movzx rax, al\n");
            return;
        }

        if (left_type == TYPE_ARRAY || left_type == TYPE_ARRAY2 || left_type == TYPE_ARRAY_STR || left_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rcx");
        }
        if (right_type == TYPE_ARRAY || right_type == TYPE_ARRAY2 || right_type == TYPE_ARRAY_STR || right_type == TYPE_ARRAY2_STR) {
            emit_array_len(cg, "rax");
        }

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

void gen_expr(Codegen *cg, ASTNode *node) {
    if (cg->has_error) return;
    if (!node) {
        emit(cg, "    xor rax, rax\n");
        return;
    }

    switch (node->type) {
        case NODE_INT_LITERAL:
            emit(cg, "    mov rax, %d\n", node->data.int_literal.value);
            return;
        case NODE_BOOL_LITERAL:
            emit(cg, "    mov rax, %d\n", node->data.bool_literal.value ? 1 : 0);
            return;
        case NODE_ARRAY_LITERAL: {
            int elem_count = node->data.array_literal.element_count;
            int total_size = (elem_count + 1) * 8;

            emit(cg, "    mov rdi, %d\n", total_size);
            emit(cg, "    call malloc@PLT\n");
            emit(cg, "    push rax\n");

            emit(cg, "    mov rcx, [rsp]\n");
            emit(cg, "    mov QWORD PTR [rcx], %d\n", elem_count);

            for (int i = 0; i < elem_count; i++) {
                gen_expr(cg, node->data.array_literal.elements[i]);
                emit(cg, "    mov rcx, [rsp]\n");
                emit(cg, "    mov QWORD PTR [rcx + %d], rax\n", (i + 1) * 8);
            }

            emit(cg, "    pop rax\n");
            return;
        }
        case NODE_ARRAY_INDEX: {
            gen_expr(cg, node->data.array_index.array);
            emit(cg, "    push rax\n");
            gen_expr(cg, node->data.array_index.index);
            emit(cg, "    mov rcx, rax\n");
            emit(cg, "    pop rax\n");
            emit(cg, "    mov rax, QWORD PTR [rax + rcx*8 + 8]\n");
            return;
        }
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
            if (strcmp(node->data.call.name, "timestamp") == 0) {
                if (node->data.call.arg_count != 0) {
                    set_error(cg, node, "timestamp() expects 0 arguments");
                    return;
                }
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_timestamp\n");
                return;
            }
            if (strcmp(node->data.call.name, "random") == 0) {
                if (node->data.call.arg_count != 0) {
                    set_error(cg, node, "random() expects 0 arguments");
                    return;
                }
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_random\n");
                return;
            }
            if (strcmp(node->data.call.name, "push") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "push() expects 2 arguments: array and value");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");
                emit(cg, "    pop rdi\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_array_push\n");
                return;
            }

            if (strcmp(node->data.call.name, "pop") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "pop() expects 1 argument: array");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_array_pop\n");
                return;
            }

            if (strcmp(node->data.call.name, "read") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "read() expects 1 argument: filename");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_read\n");
                return;
            }

            if (strcmp(node->data.call.name, "write") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "write() expects 2 arguments: filename, content");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");
                emit(cg, "    pop rdi\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_write\n");
                return;
            }

            if (strcmp(node->data.call.name, "append") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "append() expects 2 arguments: filename, content");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");
                emit(cg, "    pop rdi\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_append\n");
                return;
            }

            if (strcmp(node->data.call.name, "sqlite_open") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "sqlite_open() expects 1 argument: path");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_sqlite_open\n");
                return;
            }

            if (strcmp(node->data.call.name, "sqlite_close") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "sqlite_close() expects 1 argument: db");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_sqlite_close\n");
                return;
            }

            if (strcmp(node->data.call.name, "sqlite_exec") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "sqlite_exec() expects 2 arguments: db, sql");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");
                emit(cg, "    pop rdi\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_sqlite_exec\n");
                return;
            }

            if (strcmp(node->data.call.name, "sqlite_query") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "sqlite_query() expects 2 arguments: db, sql");
                    return;
                }
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");
                emit(cg, "    pop rdi\n");
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_sqlite_query\n");
                return;
            }

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
            static const char *arg_regs[] = {"rdi", "rsi", "rdx", "rcx", "r8", "r9"};

            for (int i = 0; i < node->data.call.arg_count; i++) {
                gen_expr(cg, node->data.call.args[i]);
                emit(cg, "    push rax\n");
            }

            for (int i = node->data.call.arg_count - 1; i >= 0; i--) {
                if (i < 6) {
                    emit(cg, "    pop %s\n", arg_regs[i]);
                } else {
                    emit(cg, "    pop rax\n");
                }
            }

            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call %s\n", node->data.call.name);
            emit_error_check(cg);
            return;
        }
        default:
            set_error(cg, node, "Unsupported expression node");
            return;
    }
}
