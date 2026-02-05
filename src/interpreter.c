#include "interpreter.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>

// Value functions
Value value_create_int(int val) {
    Value v;
    v.type = VALUE_INT;
    v.data.int_val = val;
    return v;
}

Value value_create_string(const char *val) {
    Value v;
    v.type = VALUE_STRING;
    v.data.string_val = malloc(strlen(val) + 1);
    strcpy(v.data.string_val, val);
    return v;
}

Value value_create_bool(int val) {
    Value v;
    v.type = VALUE_BOOL;
    v.data.bool_val = val ? 1 : 0;
    return v;
}

Value value_create_null() {
    Value v;
    v.type = VALUE_NULL;
    return v;
}

static Value value_copy(Value v) {
    if (v.type == VALUE_STRING && v.data.string_val) {
        return value_create_string(v.data.string_val);
    }
    return v;
}

void value_free(Value v) {
    if (v.type == VALUE_STRING && v.data.string_val) {
        free(v.data.string_val);
    }
}

int value_to_int(Value v) {
    switch (v.type) {
        case VALUE_INT: return v.data.int_val;
        case VALUE_BOOL: return v.data.bool_val ? 1 : 0;
        case VALUE_STRING: return atoi(v.data.string_val);
        case VALUE_NULL: return 0;
    }
    return 0;
}

char* value_to_string(Value v) {
    static char buffer[256];
    switch (v.type) {
        case VALUE_INT:
            sprintf(buffer, "%d", v.data.int_val);
            return buffer;
        case VALUE_BOOL:
            return v.data.bool_val ? "true" : "false";
        case VALUE_STRING:
            return v.data.string_val;
        case VALUE_NULL:
            return "null";
    }
    return "";
}

int value_to_bool(Value v) {
    switch (v.type) {
        case VALUE_INT: return v.data.int_val != 0;
        case VALUE_BOOL: return v.data.bool_val;
        case VALUE_STRING: return strlen(v.data.string_val) > 0;
        case VALUE_NULL: return 0;
    }
    return 0;
}

// Interpreter functions
Interpreter* interpreter_create() {
    Interpreter *interp = malloc(sizeof(Interpreter));
    
    Scope *global = malloc(sizeof(Scope));
    global->variables = NULL;
    global->parent = NULL;
    
    interp->current_scope = global;
    interp->functions = malloc(sizeof(Function*) * 256);
    interp->function_count = 0;
    interp->return_flag = 0;
    interp->return_value = value_create_null();
    
    return interp;
}

void interpreter_destroy(Interpreter *interp) {
    // Free all scopes
    Scope *scope = interp->current_scope;
    while (scope) {
        Variable *var = scope->variables;
        while (var) {
            Variable *next = var->next;
            free(var->name);
            value_free(var->value);
            free(var);
            var = next;
        }
        Scope *parent = scope->parent;
        free(scope);
        scope = parent;
    }
    
    // Free functions (note: bodies are owned by the program AST, so we don't free them)
    for (int i = 0; i < interp->function_count; i++) {
        free(interp->functions[i]->name);
        for (int j = 0; j < interp->functions[i]->param_count; j++) {
            free(interp->functions[i]->params[j]);
        }
        if (interp->functions[i]->params) free(interp->functions[i]->params);
        free(interp->functions[i]);
    }
    if (interp->functions) free(interp->functions);
    
    value_free(interp->return_value);
    free(interp);
}

static Variable* find_variable(Interpreter *interp, const char *name) {
    Scope *scope = interp->current_scope;
    while (scope) {
        Variable *var = scope->variables;
        while (var) {
            if (strcmp(var->name, name) == 0) {
                return var;
            }
            var = var->next;
        }
        scope = scope->parent;
    }
    return NULL;
}

static void set_variable(Interpreter *interp, const char *name, Value value) {
    Variable *var = find_variable(interp, name);
    if (var) {
        value_free(var->value);
        var->value = value;
    } else {
        Variable *new_var = malloc(sizeof(Variable));
        new_var->name = malloc(strlen(name) + 1);
        strcpy(new_var->name, name);
        new_var->value = value;
        new_var->next = interp->current_scope->variables;
        interp->current_scope->variables = new_var;
    }
}

static Function* find_function(Interpreter *interp, const char *name) {
    for (int i = 0; i < interp->function_count; i++) {
        if (strcmp(interp->functions[i]->name, name) == 0) {
            return interp->functions[i];
        }
    }
    return NULL;
}

static void register_function(Interpreter *interp, const char *name, char **params, 
                             int param_count, ASTNode *body) {
    Function *func = malloc(sizeof(Function));
    func->name = malloc(strlen(name) + 1);
    strcpy(func->name, name);
    func->param_count = param_count;
    func->body = body;
    
    func->params = NULL;
    if (param_count > 0) {
        func->params = malloc(sizeof(char*) * param_count);
        for (int i = 0; i < param_count; i++) {
            func->params[i] = malloc(strlen(params[i]) + 1);
            strcpy(func->params[i], params[i]);
        }
    }
    
    interp->functions[interp->function_count++] = func;
}

// Forward declaration
static Value eval_node(Interpreter *interp, ASTNode *node);

static Value eval_binary_op(Interpreter *interp, ASTNode *node) {
    Value left = eval_node(interp, node->data.binary_op.left);
    Value right = eval_node(interp, node->data.binary_op.right);
    
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
    Value operand = eval_node(interp, node->data.unary_op.operand);
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

    Function *func = find_function(interp, node->data.call.name);
    
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
    
    // Create new scope
    Scope *old_scope = interp->current_scope;
    Scope *new_scope = malloc(sizeof(Scope));
    new_scope->variables = NULL;
    new_scope->parent = old_scope;
    interp->current_scope = new_scope;
    
    // Bind arguments to parameters
    for (int i = 0; i < func->param_count; i++) {
        Value arg_value = eval_node(interp, node->data.call.args[i]);
        set_variable(interp, func->params[i], arg_value);
    }
    
    // Execute function body
    Value result = eval_node(interp, func->body);
    
    // Handle return value
    if (interp->return_flag) {
        result = interp->return_value;
        interp->return_flag = 0;
        interp->return_value = value_create_null();
    }
    
    // Restore scope
    Scope *restore_scope = interp->current_scope;
    interp->current_scope = old_scope;
    
    // Free new scope
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

static Value eval_node(Interpreter *interp, ASTNode *node) {
    if (!node) return value_create_null();
    
    if (interp->return_flag) return value_create_null();
    
    switch (node->type) {
        case NODE_PROGRAM:
        case NODE_BLOCK: {
            Value result = value_create_null();
            for (int i = 0; i < node->statement_count; i++) {
                value_free(result);
                result = eval_node(interp, node->statements[i]);
                if (interp->return_flag) break;
            }
            return result;
        }
        
        case NODE_VAR_DECL: {
            Value value = node->data.var_decl.value ? 
                         eval_node(interp, node->data.var_decl.value) : 
                         value_create_int(0);
            set_variable(interp, node->data.var_decl.name, value);
            return value_create_null();
        }
        
        case NODE_FUNC_DECL:
            register_function(interp, node->data.func_decl.name, 
                            node->data.func_decl.params, 
                            node->data.func_decl.param_count,
                            node->data.func_decl.body);
            return value_create_null();
        
        case NODE_IF_STMT: {
            Value cond = eval_node(interp, node->data.if_stmt.condition);
            Value result;
            if (value_to_bool(cond)) {
                result = eval_node(interp, node->data.if_stmt.then_branch);
            } else if (node->data.if_stmt.else_branch) {
                result = eval_node(interp, node->data.if_stmt.else_branch);
            } else {
                result = value_create_null();
            }
            value_free(cond);
            return result;
        }
        
        case NODE_WHILE_STMT: {
            Value result = value_create_null();
            while (1) {
                Value cond = eval_node(interp, node->data.while_stmt.condition);
                if (!value_to_bool(cond)) {
                    value_free(cond);
                    break;
                }
                value_free(cond);
                value_free(result);
                result = eval_node(interp, node->data.while_stmt.body);
                if (interp->return_flag) break;
            }
            return result;
        }
        
        case NODE_RETURN_STMT: {
            interp->return_value = node->data.return_stmt.value ? 
                                   eval_node(interp, node->data.return_stmt.value) : 
                                   value_create_null();
            interp->return_flag = 1;
            return value_create_null();
        }
        
        case NODE_PRINT_STMT: {
            Value val = eval_node(interp, node->data.print_stmt.value);
            printf("%s\n", value_to_string(val));
            value_free(val);
            return value_create_null();
        }
        
        case NODE_ASSIGNMENT: {
            Value value = eval_node(interp, node->data.assignment.value);
            set_variable(interp, node->data.assignment.name, value);
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
            // Return a copy of the variable value
            Value result;
            if (var->value.type == VALUE_STRING) {
                result = value_create_string(var->value.data.string_val);
            } else {
                result = var->value;
            }
            return result;
        }
        
        default:
            return value_create_null();
    }
}

void interpreter_execute(Interpreter *interp, ASTNode *program) {
    eval_node(interp, program);
}

Value interpreter_eval(Interpreter *interp, ASTNode *node) {
    return eval_node(interp, node);
}
