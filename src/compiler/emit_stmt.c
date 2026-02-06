#include "compiler/emit.h"
#include "compiler/codegen_ctx.h"

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
        default:
            set_error(cg, node, "Unsupported statement node");
            return;
    }
}
