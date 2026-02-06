#include "runtime/eval.h"
#include "runtime/interpreter_internal.h"
#include "runtime/io.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static Value eval_node_inner(Interpreter *interp, ASTNode *node);

static Value eval_binary_op(Interpreter *interp, ASTNode *node) {
    Value left = eval_node_inner(interp, node->data.binary_op.left);
    Value right = eval_node_inner(interp, node->data.binary_op.right);

    const char *op = node->data.binary_op.op;
    Value result;

    if (strcmp(op, "+") == 0) {
        if (left.type == VALUE_STRING || right.type == VALUE_STRING) {
            char buffer[512];
            sprintf(buffer, "%s%s", value_to_string(left), value_to_string(right));
            result = value_create_string(buffer);
        } else {
            result = value_create_int(value_to_int(left) + value_to_int(right));
        }
    } else if (strcmp(op, "-") == 0) {
        result = value_create_int(value_to_int(left) - value_to_int(right));
    } else if (strcmp(op, "*") == 0) {
        result = value_create_int(value_to_int(left) * value_to_int(right));
    } else if (strcmp(op, "/") == 0) {
        int r = value_to_int(right);
        if (r == 0) {
            fprintf(stderr, "Runtime Error: Line %d:%d: Division by zero\n", node->line, node->column);
            result = value_create_int(0);
        } else {
            result = value_create_int(value_to_int(left) / r);
        }
    } else if (strcmp(op, "%") == 0) {
        int r = value_to_int(right);
        if (r == 0) {
            fprintf(stderr, "Runtime Error: Line %d:%d: Modulo by zero\n", node->line, node->column);
            result = value_create_int(0);
        } else {
            result = value_create_int(value_to_int(left) % r);
        }
    } else if (strcmp(op, "<") == 0) {
        result = value_create_bool(value_to_int(left) < value_to_int(right));
    } else if (strcmp(op, "<=") == 0) {
        result = value_create_bool(value_to_int(left) <= value_to_int(right));
    } else if (strcmp(op, ">") == 0) {
        result = value_create_bool(value_to_int(left) > value_to_int(right));
    } else if (strcmp(op, ">=") == 0) {
        result = value_create_bool(value_to_int(left) >= value_to_int(right));
    } else if (strcmp(op, "==") == 0) {
        int eq = 0;
        if (left.type == VALUE_STRING && right.type == VALUE_STRING) {
            eq = strcmp(left.data.string_val, right.data.string_val) == 0;
        } else {
            eq = value_to_int(left) == value_to_int(right);
        }
        result = value_create_bool(eq);
    } else if (strcmp(op, "!=") == 0) {
        int neq = 1;
        if (left.type == VALUE_STRING && right.type == VALUE_STRING) {
            neq = strcmp(left.data.string_val, right.data.string_val) != 0;
        } else {
            neq = value_to_int(left) != value_to_int(right);
        }
        result = value_create_bool(neq);
    } else if (strcmp(op, "&&") == 0) {
        result = value_create_bool(value_to_bool(left) && value_to_bool(right));
    } else if (strcmp(op, "||") == 0) {
        result = value_create_bool(value_to_bool(left) || value_to_bool(right));
    } else {
        result = value_create_null();
    }

    value_free(left);
    value_free(right);
    return result;
}

static Value eval_unary_op(Interpreter *interp, ASTNode *node) {
    Value operand = eval_node_inner(interp, node->data.unary_op.operand);
    Value result;

    const char *op = node->data.unary_op.op;

    if (strcmp(op, "-") == 0) {
        result = value_create_int(-value_to_int(operand));
    } else if (strcmp(op, "!") == 0) {
        result = value_create_bool(!value_to_bool(operand));
    } else {
        result = value_create_null();
    }

    value_free(operand);
    return result;
}

static Value eval_call(Interpreter *interp, ASTNode *node) {
    if (strcmp(node->data.call.name, "timestamp") == 0) {
        if (node->data.call.arg_count != 0) {
            fprintf(stderr, "Runtime Error: Line %d:%d: timestamp() expects 0 arguments\n",
                    node->line, node->column);
            return value_create_null();
        }
        return value_create_int((int)time(NULL));
    }

    if (strcmp(node->data.call.name, "random") == 0) {
        if (node->data.call.arg_count != 0) {
            fprintf(stderr, "Runtime Error: Line %d:%d: random() expects 0 arguments\n",
                    node->line, node->column);
            return value_create_null();
        }
        static int rand_seeded = 0;
        if (!rand_seeded) {
            srand((unsigned)time(NULL));
            rand_seeded = 1;
        }
        return value_create_int(rand());
    }

    if (strcmp(node->data.call.name, "read") == 0) {
        if (node->data.call.arg_count != 1) {
            fprintf(stderr, "Runtime Error: Line %d:%d: read() expects 1 argument: filename\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value path_val = eval_node_inner(interp, node->data.call.args[0]);
        const char *path = value_to_string(path_val);
        char *contents = read_file_contents(path);
        value_free(path_val);

        if (!contents) {
            return value_create_null();
        }

        Value result = value_create_string(contents);
        free(contents);
        return result;
    }

    if (strcmp(node->data.call.name, "write") == 0) {
        if (node->data.call.arg_count != 2) {
            fprintf(stderr, "Runtime Error: Line %d:%d: write() expects 2 arguments: filename, content\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value path_val = eval_node_inner(interp, node->data.call.args[0]);
        Value content_val = eval_node_inner(interp, node->data.call.args[1]);
        const char *path = value_to_string(path_val);
        const char *content = value_to_string(content_val);
        int rc = write_file_contents(path, content, "w");
        value_free(path_val);
        value_free(content_val);
        return value_create_int(rc);
    }

    if (strcmp(node->data.call.name, "append") == 0) {
        if (node->data.call.arg_count != 2) {
            fprintf(stderr, "Runtime Error: Line %d:%d: append() expects 2 arguments: filename, content\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value path_val = eval_node_inner(interp, node->data.call.args[0]);
        Value content_val = eval_node_inner(interp, node->data.call.args[1]);
        const char *path = value_to_string(path_val);
        const char *content = value_to_string(content_val);
        int rc = write_file_contents(path, content, "a");
        value_free(path_val);
        value_free(content_val);
        return value_create_int(rc);
    }

    if (strcmp(node->data.call.name, "push") == 0) {
        if (node->data.call.arg_count != 2) {
            fprintf(stderr, "Runtime Error: Line %d:%d: push() expects 2 arguments: array and value\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value array_val = eval_node_inner(interp, node->data.call.args[0]);
        if (array_val.type != VALUE_ARRAY || !array_val.data.array_val) {
            value_free(array_val);
            fprintf(stderr, "Runtime Error: Line %d:%d: push() expects an array value\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value item_val = eval_node_inner(interp, node->data.call.args[1]);
        ArrayValue *arr = array_val.data.array_val;
        if (!array_ensure_capacity(arr, arr->length + 1)) {
            value_free(item_val);
            fprintf(stderr, "Runtime Error: Line %d:%d: push() failed to grow array\n",
                    node->line, node->column);
            return value_create_null();
        }

        arr->items[arr->length] = value_copy(item_val);
        arr->length += 1;
        value_free(item_val);
        return array_val;
    }

    if (strcmp(node->data.call.name, "pop") == 0) {
        if (node->data.call.arg_count != 1) {
            fprintf(stderr, "Runtime Error: Line %d:%d: pop() expects 1 argument: array\n",
                    node->line, node->column);
            return value_create_null();
        }

        Value array_val = eval_node_inner(interp, node->data.call.args[0]);
        if (array_val.type != VALUE_ARRAY || !array_val.data.array_val) {
            value_free(array_val);
            fprintf(stderr, "Runtime Error: Line %d:%d: pop() expects an array value\n",
                    node->line, node->column);
            return value_create_null();
        }

        ArrayValue *arr = array_val.data.array_val;
        if (arr->length <= 0) {
            return value_create_int(0);
        }

        arr->length -= 1;
        return arr->items[arr->length];
    }

    Function *func = interp_find_function(interp, node->data.call.name);

    if (!func) {
        fprintf(stderr, "Runtime Error: Line %d:%d: Function '%s' not found\n",
                node->line, node->column, node->data.call.name);
        return value_create_null();
    }

    if (node->data.call.arg_count != func->param_count) {
        fprintf(stderr, "Runtime Error: Line %d:%d: Function '%s' expects %d arguments, got %d\n",
                node->line, node->column, node->data.call.name, func->param_count, node->data.call.arg_count);
        return value_create_null();
    }

    Scope *old_scope = interp->current_scope;
    Scope *new_scope = malloc(sizeof(Scope));
    new_scope->variables = NULL;
    new_scope->parent = old_scope;
    interp->current_scope = new_scope;

    for (int i = 0; i < func->param_count; i++) {
        Value arg_value = eval_node_inner(interp, node->data.call.args[i]);
        define_variable(interp, func->params[i], arg_value);
    }

    Value result = eval_node_inner(interp, func->body);

    if (interp->return_flag) {
        result = interp->return_value;
        interp->return_flag = 0;
        interp->return_value = value_create_null();
    }

    Scope *restore_scope = interp->current_scope;
    interp->current_scope = old_scope;

    Variable *var = restore_scope->variables;
    while (var) {
        Variable *next = var->next;
        free(var->name);
        value_free(var->value);
        free(var);
        var = next;
    }
    free(restore_scope);

    return result;
}

static Value eval_node_inner(Interpreter *interp, ASTNode *node) {
    if (!node) return value_create_null();

    if (interp->return_flag) return value_create_null();

    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK: {
            Value result = value_create_null();
            for (int i = 0; i < node->statement_count; i++) {
                value_free(result);
                result = eval_node_inner(interp, node->statements[i]);
                if (interp->return_flag) break;
            }
            return result;
        }

        case NODE_VAR_DECL: {
            Value value = node->data.var_decl.value ?
                         eval_node_inner(interp, node->data.var_decl.value) :
                         value_create_int(0);
            define_variable(interp, node->data.var_decl.name, value);
            return value_create_null();
        }

        case NODE_FUNC_DECL:
            register_function(interp, node->data.func_decl.name,
                            node->data.func_decl.params,
                            node->data.func_decl.param_count,
                            node->data.func_decl.body);
            return value_create_null();

        case NODE_IF_STMT: {
            Value cond = eval_node_inner(interp, node->data.if_stmt.condition);
            Value result;
            if (value_to_bool(cond)) {
                result = eval_node_inner(interp, node->data.if_stmt.then_branch);
            } else if (node->data.if_stmt.else_branch) {
                result = eval_node_inner(interp, node->data.if_stmt.else_branch);
            } else {
                result = value_create_null();
            }
            value_free(cond);
            return result;
        }

        case NODE_WHILE_STMT: {
            Value result = value_create_null();
            while (1) {
                Value cond = eval_node_inner(interp, node->data.while_stmt.condition);
                if (!value_to_bool(cond)) {
                    value_free(cond);
                    break;
                }
                value_free(cond);
                value_free(result);
                result = eval_node_inner(interp, node->data.while_stmt.body);
                if (interp->return_flag) break;
            }
            return result;
        }

        case NODE_RETURN_STMT: {
            interp->return_value = node->data.return_stmt.value ?
                                   eval_node_inner(interp, node->data.return_stmt.value) :
                                   value_create_null();
            interp->return_flag = 1;
            return value_create_null();
        }

        case NODE_PRINT_STMT: {
            Value val = eval_node_inner(interp, node->data.print_stmt.value);
            printf("%s\n", value_to_string(val));
            value_free(val);
            return value_create_null();
        }

        case NODE_ASSIGNMENT: {
            Value value = eval_node_inner(interp, node->data.assignment.value);
            assign_variable(interp, node->data.assignment.name, value);
            return value_copy(value);
        }

        case NODE_CALL:
            return eval_call(interp, node);

        case NODE_BINARY_OP:
            return eval_binary_op(interp, node);

        case NODE_UNARY_OP:
            return eval_unary_op(interp, node);

        case NODE_INT_LITERAL:
            return value_create_int(node->data.int_literal.value);

        case NODE_STRING_LITERAL:
            return value_create_string(node->data.string_literal.value);

        case NODE_BOOL_LITERAL:
            return value_create_bool(node->data.bool_literal.value);

        case NODE_IDENTIFIER: {
            Variable *var = find_variable(interp, node->data.identifier.name);
            if (!var) {
                fprintf(stderr, "Runtime Error: Line %d:%d: Variable '%s' not defined\n",
                       node->line, node->column, node->data.identifier.name);
                return value_create_null();
            }
            Value result;
            if (var->value.type == VALUE_STRING) {
                result = value_create_string(var->value.data.string_val);
            } else if (var->value.type == VALUE_ARRAY) {
                result = value_copy(var->value);
            } else {
                result = var->value;
            }
            return result;
        }

        case NODE_ARRAY_LITERAL: {
            int count = node->data.array_literal.element_count;
            ArrayValue *arr = array_create(count);
            if (!arr) {
                fprintf(stderr, "Runtime Error: Line %d:%d: Failed to allocate array\n",
                        node->line, node->column);
                return value_create_null();
            }

            for (int i = 0; i < count; i++) {
                Value elem = eval_node_inner(interp, node->data.array_literal.elements[i]);
                if (!array_ensure_capacity(arr, arr->length + 1)) {
                    value_free(elem);
                    fprintf(stderr, "Runtime Error: Line %d:%d: Failed to grow array\n",
                            node->line, node->column);
                    return value_create_null();
                }
                arr->items[arr->length] = value_copy(elem);
                arr->length += 1;
                value_free(elem);
            }

            return value_create_array(arr);
        }

        case NODE_ARRAY_INDEX: {
            Value array_val = eval_node_inner(interp, node->data.array_index.array);
            Value index_val = eval_node_inner(interp, node->data.array_index.index);
            if (array_val.type != VALUE_ARRAY || !array_val.data.array_val) {
                value_free(index_val);
                value_free(array_val);
                fprintf(stderr, "Runtime Error: Line %d:%d: Indexing requires an array\n",
                        node->line, node->column);
                return value_create_null();
            }

            int idx = value_to_int(index_val);
            value_free(index_val);
            ArrayValue *arr = array_val.data.array_val;
            if (idx < 0 || idx >= arr->length) {
                value_free(array_val);
                fprintf(stderr, "Runtime Error: Line %d:%d: Array index out of bounds\n",
                        node->line, node->column);
                return value_create_null();
            }
            Value result = value_copy(arr->items[idx]);
            value_free(array_val);
            return result;
        }

        default:
            return value_create_null();
    }
}

Value eval_node(Interpreter *interp, ASTNode *node) {
    return eval_node_inner(interp, node);
}
