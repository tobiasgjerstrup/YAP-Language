#include "compiler/analysis.h"
#include <stdlib.h>
#include <string.h>

void prepass_strings(Codegen *cg, ASTNode *node) {
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

void prepass_functions(Codegen *cg, ASTNode *node) {
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
            cg->functions[cg->function_count].param_types = NULL;
            if (node->data.func_decl.param_count > 0) {
                cg->functions[cg->function_count].params = malloc(sizeof(char*) * node->data.func_decl.param_count);
                cg->functions[cg->function_count].param_types = malloc(sizeof(VarType) * node->data.func_decl.param_count);
                for (int i = 0; i < node->data.func_decl.param_count; i++) {
                    cg->functions[cg->function_count].params[i] = malloc(strlen(node->data.func_decl.params[i]) + 1);
                    strcpy(cg->functions[cg->function_count].params[i], node->data.func_decl.params[i]);
                    cg->functions[cg->function_count].param_types[i] = TYPE_INT;
                }
            }
            cg->function_count++;
            break;
        default:
            break;
    }
}

VarType infer_expr_type(Codegen *cg, ASTNode *node, FunctionDef *current_func) {
    if (!node) return TYPE_INT;
    switch (node->type) {
        case NODE_STRING_LITERAL:
            return TYPE_STRING;
        case NODE_BOOL_LITERAL:
            return TYPE_BOOL;
        case NODE_ARRAY_LITERAL:
            return TYPE_ARRAY;
        case NODE_INT_LITERAL:
            return TYPE_INT;
        case NODE_ARRAY_INDEX:
            if (node->data.array_index.array && node->data.array_index.array->type == NODE_IDENTIFIER) {
                if (strcmp(node->data.array_index.array->data.identifier.name, "args") == 0) {
                    return TYPE_STRING;
                }
            }
            return TYPE_INT;
        case NODE_IDENTIFIER:
            if (current_func && current_func->param_types) {
                for (int i = 0; i < current_func->param_count; i++) {
                    if (strcmp(current_func->params[i], node->data.identifier.name) == 0) {
                        return current_func->param_types[i];
                    }
                }
            }
            return TYPE_INT;
        case NODE_UNARY_OP:
            if (strcmp(node->data.unary_op.op, "!") == 0) return TYPE_BOOL;
            return TYPE_INT;
        case NODE_BINARY_OP: {
            const char *op = node->data.binary_op.op;
            if (strcmp(op, "<") == 0 || strcmp(op, "<=") == 0 ||
                strcmp(op, ">") == 0 || strcmp(op, ">=") == 0 ||
                strcmp(op, "==") == 0 || strcmp(op, "!=") == 0 ||
                strcmp(op, "&&") == 0 || strcmp(op, "||") == 0) {
                return TYPE_BOOL;
            }
            if (strcmp(op, "+") == 0) {
                VarType left = infer_expr_type(cg, node->data.binary_op.left, current_func);
                VarType right = infer_expr_type(cg, node->data.binary_op.right, current_func);
                if (left == TYPE_STRING || right == TYPE_STRING) return TYPE_STRING;
            }
            return TYPE_INT;
        }
        case NODE_CALL:
            if (strcmp(node->data.call.name, "read") == 0) return TYPE_STRING;
            return TYPE_INT;
        default:
            return TYPE_INT;
    }
}

void infer_param_types(Codegen *cg, ASTNode *node, FunctionDef *current_func, int *changed) {
    if (!node) return;
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK:
            for (int i = 0; i < node->statement_count; i++) {
                infer_param_types(cg, node->statements[i], current_func, changed);
            }
            return;
        case NODE_FUNC_DECL: {
            FunctionDef *func = find_function(cg, node->data.func_decl.name);
            if (func) {
                infer_param_types(cg, node->data.func_decl.body, func, changed);
            }
            return;
        }
        case NODE_CALL: {
            FunctionDef *callee = find_function(cg, node->data.call.name);
            if (callee && callee->param_types) {
                if (strcmp(node->data.call.name, "assert_eq_str") == 0) {
                    if (callee->param_count > 0) callee->param_types[0] = TYPE_STRING;
                    if (callee->param_count > 1) callee->param_types[1] = TYPE_STRING;
                    if (callee->param_count > 2) callee->param_types[2] = TYPE_STRING;
                } else if (strcmp(node->data.call.name, "assert_eq_int") == 0) {
                    if (callee->param_count > 0) callee->param_types[0] = TYPE_INT;
                    if (callee->param_count > 1) callee->param_types[1] = TYPE_INT;
                    if (callee->param_count > 2) callee->param_types[2] = TYPE_STRING;
                } else if (strcmp(node->data.call.name, "assert_true") == 0) {
                    if (callee->param_count > 0) callee->param_types[0] = TYPE_BOOL;
                    if (callee->param_count > 1) callee->param_types[1] = TYPE_STRING;
                } else if (strcmp(node->data.call.name, "check") == 0) {
                    if (callee->param_count > 0) callee->param_types[0] = TYPE_BOOL;
                    if (callee->param_count > 1) callee->param_types[1] = TYPE_STRING;
                }

                for (int i = 0; i < node->data.call.arg_count && i < callee->param_count; i++) {
                    VarType arg_type = infer_expr_type(cg, node->data.call.args[i], current_func);
                    VarType merged = merge_types(callee->param_types[i], arg_type);
                    if (merged != callee->param_types[i]) {
                        callee->param_types[i] = merged;
                        if (changed) *changed = 1;
                    }
                }
            }
            for (int i = 0; i < node->data.call.arg_count; i++) {
                infer_param_types(cg, node->data.call.args[i], current_func, changed);
            }
            return;
        }
        case NODE_VAR_DECL:
            infer_param_types(cg, node->data.var_decl.value, current_func, changed);
            return;
        case NODE_ASSIGNMENT:
            infer_param_types(cg, node->data.assignment.value, current_func, changed);
            return;
        case NODE_PRINT_STMT:
            infer_param_types(cg, node->data.print_stmt.value, current_func, changed);
            return;
        case NODE_IF_STMT:
            infer_param_types(cg, node->data.if_stmt.condition, current_func, changed);
            infer_param_types(cg, node->data.if_stmt.then_branch, current_func, changed);
            infer_param_types(cg, node->data.if_stmt.else_branch, current_func, changed);
            return;
        case NODE_WHILE_STMT:
            infer_param_types(cg, node->data.while_stmt.condition, current_func, changed);
            infer_param_types(cg, node->data.while_stmt.body, current_func, changed);
            return;
        case NODE_RETURN_STMT:
            infer_param_types(cg, node->data.return_stmt.value, current_func, changed);
            return;
        case NODE_BINARY_OP:
            infer_param_types(cg, node->data.binary_op.left, current_func, changed);
            infer_param_types(cg, node->data.binary_op.right, current_func, changed);
            return;
        case NODE_UNARY_OP:
            infer_param_types(cg, node->data.unary_op.operand, current_func, changed);
            return;
        case NODE_ARRAY_LITERAL:
            for (int i = 0; i < node->data.array_literal.element_count; i++) {
                infer_param_types(cg, node->data.array_literal.elements[i], current_func, changed);
            }
            return;
        case NODE_ARRAY_INDEX:
            infer_param_types(cg, node->data.array_index.array, current_func, changed);
            infer_param_types(cg, node->data.array_index.index, current_func, changed);
            return;
        default:
            return;
    }
}

void collect_locals(Codegen *cg, ASTNode *node) {
    if (!node) return;

    switch (node->type) {
        case NODE_VAR_DECL:
            add_local(cg, node->data.var_decl.name);
            if (node->data.var_decl.value) {
                collect_locals(cg, node->data.var_decl.value);
            }
            return;
        case NODE_BLOCK:
        case NODE_PROGRAM:
            for (int i = 0; i < node->statement_count; i++) {
                collect_locals(cg, node->statements[i]);
            }
            return;
        case NODE_IF_STMT:
            collect_locals(cg, node->data.if_stmt.condition);
            collect_locals(cg, node->data.if_stmt.then_branch);
            collect_locals(cg, node->data.if_stmt.else_branch);
            return;
        case NODE_WHILE_STMT:
            collect_locals(cg, node->data.while_stmt.condition);
            collect_locals(cg, node->data.while_stmt.body);
            return;
        case NODE_RETURN_STMT:
            collect_locals(cg, node->data.return_stmt.value);
            return;
        case NODE_PRINT_STMT:
            collect_locals(cg, node->data.print_stmt.value);
            return;
        case NODE_ASSIGNMENT:
            collect_locals(cg, node->data.assignment.value);
            return;
        case NODE_BINARY_OP:
            collect_locals(cg, node->data.binary_op.left);
            collect_locals(cg, node->data.binary_op.right);
            return;
        case NODE_UNARY_OP:
            collect_locals(cg, node->data.unary_op.operand);
            return;
        case NODE_CALL:
            for (int i = 0; i < node->data.call.arg_count; i++) {
                collect_locals(cg, node->data.call.args[i]);
            }
            return;
        case NODE_ARRAY_LITERAL:
            for (int i = 0; i < node->data.array_literal.element_count; i++) {
                collect_locals(cg, node->data.array_literal.elements[i]);
            }
            return;
        case NODE_ARRAY_INDEX:
            collect_locals(cg, node->data.array_index.array);
            collect_locals(cg, node->data.array_index.index);
            return;
        default:
            return;
    }
}
