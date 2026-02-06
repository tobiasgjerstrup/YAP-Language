#include "compiler/codegen_ctx.h"
#include <stdarg.h>
#include <stdlib.h>
#include <string.h>

void set_error(Codegen *cg, ASTNode *node, const char *fmt, ...) {
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

void emit(Codegen *cg, const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(cg->out, fmt, args);
    va_end(args);
}

int get_label(Codegen *cg) {
    if (cg->label_counter >= MAX_LABELS - 1) {
        set_error(cg, NULL, "Too many labels");
        return -1;
    }
    return cg->label_counter++;
}

int find_local(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->local_count; i++) {
        if (strcmp(cg->locals[i].name, name) == 0) return i;
    }
    return -1;
}

int add_local(Codegen *cg, const char *name) {
    int existing = find_local(cg, name);
    if (existing >= 0) return existing;
    if (cg->local_count >= MAX_LOCALS) return -1;
    cg->locals[cg->local_count].name = malloc(strlen(name) + 1);
    strcpy(cg->locals[cg->local_count].name, name);
    cg->locals[cg->local_count].offset = (cg->local_count + 1) * 8;
    cg->locals[cg->local_count].type = TYPE_INT;
    return cg->local_count++;
}

void set_local_type(Codegen *cg, const char *name, VarType type) {
    int idx = find_local(cg, name);
    if (idx >= 0) {
        cg->locals[idx].type = type;
    }
}

VarType get_local_type(Codegen *cg, const char *name) {
    int idx = find_local(cg, name);
    if (idx >= 0) {
        return cg->locals[idx].type;
    }
    return TYPE_INT;
}

void free_locals(Codegen *cg) {
    for (int i = 0; i < cg->local_count; i++) {
        free(cg->locals[i].name);
    }
    cg->local_count = 0;
}

FunctionDef* find_function(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->function_count; i++) {
        if (strcmp(cg->functions[i].name, name) == 0) {
            return &cg->functions[i];
        }
    }
    return NULL;
}

VarType merge_types(VarType existing, VarType incoming) {
    if (existing == incoming) return existing;
    if (incoming == TYPE_STRING || existing == TYPE_STRING) return TYPE_STRING;
    if (incoming == TYPE_ARRAY || existing == TYPE_ARRAY) return TYPE_ARRAY;
    if (incoming == TYPE_BOOL || existing == TYPE_BOOL) return TYPE_BOOL;
    return existing;
}

int find_string(Codegen *cg, const char *value) {
    for (int i = 0; i < cg->string_count; i++) {
        if (strcmp(cg->strings[i].value, value) == 0) {
            return cg->strings[i].label_id;
        }
    }
    return -1;
}

int add_string(Codegen *cg, const char *value) {
    int existing = find_string(cg, value);
    if (existing >= 0) return existing;
    if (cg->string_count >= MAX_STRINGS) return -1;
    cg->strings[cg->string_count].value = malloc(strlen(value) + 1);
    strcpy(cg->strings[cg->string_count].value, value);
    cg->strings[cg->string_count].label_id = get_label(cg);
    return cg->strings[cg->string_count++].label_id;
}
