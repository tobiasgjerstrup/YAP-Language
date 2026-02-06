#include "runtime/interpreter.h"
#include "runtime/interpreter_internal.h"
#include "runtime/eval.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Interpreter* interpreter_create(void) {
    Interpreter *interp = malloc(sizeof(Interpreter));

    Scope *global = malloc(sizeof(Scope));
    global->variables = NULL;
    global->parent = NULL;

    interp->current_scope = global;
    interp->functions = malloc(sizeof(Function*) * 256);
    interp->function_count = 0;
    interp->return_flag = 0;
    interp->return_value = value_create_null();
    interp->error_flag = 0;
    interp->error_line = 0;
    interp->error_column = 0;
    interp->error_message = NULL;

    return interp;
}

void interpreter_destroy(Interpreter *interp) {
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
    if (interp->error_message) {
        free(interp->error_message);
    }
    free(interp);
}

Variable* find_variable(Interpreter *interp, const char *name) {
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

void define_variable(Interpreter *interp, const char *name, Value value) {
    Variable *var = interp->current_scope->variables;
    while (var) {
        if (strcmp(var->name, name) == 0) {
            value_free(var->value);
            var->value = value;
            return;
        }
        var = var->next;
    }

    Variable *new_var = malloc(sizeof(Variable));
    new_var->name = malloc(strlen(name) + 1);
    strcpy(new_var->name, name);
    new_var->value = value;
    new_var->next = interp->current_scope->variables;
    interp->current_scope->variables = new_var;
}

void assign_variable(Interpreter *interp, const char *name, Value value) {
    Variable *var = find_variable(interp, name);
    if (var) {
        value_free(var->value);
        var->value = value;
        return;
    }

    define_variable(interp, name, value);
}

Function* interp_find_function(Interpreter *interp, const char *name) {
    for (int i = 0; i < interp->function_count; i++) {
        if (strcmp(interp->functions[i]->name, name) == 0) {
            return interp->functions[i];
        }
    }
    return NULL;
}

void register_function(Interpreter *interp, const char *name, char **params,
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

void interpreter_execute(Interpreter *interp, ASTNode *program) {
    eval_node(interp, program);
    if (interp->error_flag) {
        fprintf(stderr, "Runtime Error: Line %d:%d: %s\n",
                interp->error_line, interp->error_column,
                interp->error_message ? interp->error_message : "unknown error");
        free(interp->error_message);
        interp->error_message = NULL;
        interp->error_flag = 0;
        interp->error_line = 0;
        interp->error_column = 0;
    }
}

Value interpreter_eval(Interpreter *interp, ASTNode *node) {
    return eval_node(interp, node);
}

void interpreter_define_global(Interpreter *interp, const char *name, Value value) {
    if (!interp || !name) {
        return;
    }
    define_variable(interp, name, value);
}
