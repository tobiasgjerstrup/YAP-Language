#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif
#include "lexer.h"
#include "parser.h"
#include "runtime/interpreter.h"
#include "compiler/compiler.h"

static int has_yap_extension(const char *path) {
    size_t len = strlen(path);
    if (len < 4) return 0;
    return strcmp(path + len - 4, ".yap") == 0;
}

static int is_stdlib_import(const char *path, const char **module_out) {
    if (!path) return 0;

    if (strncmp(path, "std/", 4) == 0) {
        *module_out = path + 4;
        return 1;
    }
    if (strncmp(path, "std\\", 4) == 0) {
        *module_out = path + 4;
        return 1;
    }
    if (strncmp(path, "/std/", 5) == 0) {
        *module_out = path + 5;
        return 1;
    }
    if (strncmp(path, "/std\\", 5) == 0) {
        *module_out = path + 5;
        return 1;
    }
    return 0;
}

static char* get_executable_dir() {
    char buffer[4096];
    buffer[0] = '\0';

#ifdef _WIN32
    DWORD len = GetModuleFileNameA(NULL, buffer, sizeof(buffer));
    if (len == 0 || len >= sizeof(buffer)) return NULL;
#else
    ssize_t len = readlink("/proc/self/exe", buffer, sizeof(buffer) - 1);
    if (len <= 0 || len >= (ssize_t)sizeof(buffer)) return NULL;
    buffer[len] = '\0';
#endif

    for (int i = (int)strlen(buffer) - 1; i >= 0; i--) {
        if (buffer[i] == '/' || buffer[i] == '\\') {
            buffer[i] = '\0';
            break;
        }
    }

    size_t out_len = strlen(buffer);
    char *out = malloc(out_len + 1);
    if (!out) return NULL;
    memcpy(out, buffer, out_len + 1);
    return out;
}

static char* join_path(const char *left, const char *right) {
    if (!left || !right) return NULL;
    char sep = '/';
    if (strchr(left, '\\')) sep = '\\';

    size_t left_len = strlen(left);
    size_t right_len = strlen(right);
    int need_sep = left_len > 0 && left[left_len - 1] != '/' && left[left_len - 1] != '\\';

    size_t total = left_len + right_len + (need_sep ? 1 : 0);
    char *out = malloc(total + 1);
    if (!out) return NULL;

    memcpy(out, left, left_len);
    if (need_sep) {
        out[left_len] = sep;
        memcpy(out + left_len + 1, right, right_len);
        out[total] = '\0';
    } else {
        memcpy(out + left_len, right, right_len);
        out[total] = '\0';
    }

    return out;
}

static char* read_file_from_path(const char *path) {
    FILE *file = fopen(path, "rb");
    if (!file) {
        return NULL;
    }

    if (fseek(file, 0, SEEK_END) != 0) {
        fclose(file);
        return NULL;
    }

    long size = ftell(file);
    if (size < 0) {
        fclose(file);
        return NULL;
    }

    if (fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return NULL;
    }

    char *buffer = malloc((size_t)size + 1);
    if (!buffer) {
        fclose(file);
        return NULL;
    }

    size_t read_bytes = fread(buffer, 1, (size_t)size, file);
    buffer[read_bytes] = '\0';

    fclose(file);
    return buffer;
}

char* read_file(const char *filename) {
    const char *module = NULL;
    if (is_stdlib_import(filename, &module)) {
        char module_with_ext[512];
        if (has_yap_extension(module)) {
            snprintf(module_with_ext, sizeof(module_with_ext), "%s", module);
        } else {
            snprintf(module_with_ext, sizeof(module_with_ext), "%s.yap", module);
        }

        const char *env_root = getenv("YAP_STD_PATH");
        if (env_root && env_root[0] != '\0') {
            char *env_path = join_path(env_root, module_with_ext);
            if (env_path) {
                char *data = read_file_from_path(env_path);
                free(env_path);
                if (data) return data;
            }
        }

        char *exe_dir = get_executable_dir();
        if (exe_dir) {
            char *std_dir = join_path(exe_dir, "std");
            if (std_dir) {
                char *std_path = join_path(std_dir, module_with_ext);
                free(std_dir);
                if (std_path) {
                    char *data = read_file_from_path(std_path);
                    free(std_path);
                    if (data) {
                        free(exe_dir);
                        return data;
                    }
                }
            }
            free(exe_dir);
        }

        char *cwd_std = join_path("./std", module_with_ext);
        if (cwd_std) {
            char *data = read_file_from_path(cwd_std);
            free(cwd_std);
            if (data) return data;
        }

        fprintf(stderr, "Error: Could not open stdlib module '%s' (set YAP_STD_PATH or place std/ next to the executable)\n", filename);
        return NULL;
    }

    char *data = read_file_from_path(filename);
    if (!data) {
        fprintf(stderr, "Error: Could not open file '%s'\n", filename);
        return NULL;
    }
    return data;
}

// Resolve relative import paths (for now, just join paths)
char* resolve_import_path(const char *current_file, const char *import_path) {
    // If import_path is absolute or already has paths, use as-is
    if (import_path[0] == '/' || strstr(import_path, "/")) {
        char *resolved = malloc(strlen(import_path) + 1);
        strcpy(resolved, import_path);
        return resolved;
    }
    
    // Otherwise, resolve relative to current file's directory
    // For simple implementation, just use the import path directly
    // In a real system, you'd extract the directory from current_file
    char *resolved = malloc(strlen(import_path) + 1);
    strcpy(resolved, import_path);
    return resolved;
}

// Deep copy an AST node
ASTNode* ast_copy_node(ASTNode *node) {
    if (!node) return NULL;
    
    ASTNode *copy = malloc(sizeof(ASTNode));
    copy->type = node->type;
    copy->line = node->line;
    copy->column = node->column;
    copy->statement_count = node->statement_count;
    
    if (node->statement_count > 0 && node->statements) {
        copy->statements = malloc(node->statement_count * sizeof(ASTNode*));
        for (int i = 0; i < node->statement_count; i++) {
            copy->statements[i] = ast_copy_node(node->statements[i]);
        }
    } else {
        copy->statements = NULL;
    }
    
    // Copy data based on node type
    switch (node->type) {
        case NODE_FUNC_DECL: {
            copy->data.func_decl.name = malloc(strlen(node->data.func_decl.name) + 1);
            strcpy(copy->data.func_decl.name, node->data.func_decl.name);
            copy->data.func_decl.param_count = node->data.func_decl.param_count;
            copy->data.func_decl.is_exported = node->data.func_decl.is_exported;
            if (node->data.func_decl.param_count > 0) {
                copy->data.func_decl.params = malloc(node->data.func_decl.param_count * sizeof(char*));
                for (int i = 0; i < node->data.func_decl.param_count; i++) {
                    copy->data.func_decl.params[i] = malloc(strlen(node->data.func_decl.params[i]) + 1);
                    strcpy(copy->data.func_decl.params[i], node->data.func_decl.params[i]);
                }
            } else {
                copy->data.func_decl.params = NULL;
            }
            copy->data.func_decl.body = ast_copy_node(node->data.func_decl.body);
            break;
        }
        case NODE_VAR_DECL: {
            copy->data.var_decl.name = malloc(strlen(node->data.var_decl.name) + 1);
            strcpy(copy->data.var_decl.name, node->data.var_decl.name);
            copy->data.var_decl.value = ast_copy_node(node->data.var_decl.value);
            break;
        }
        case NODE_ASSIGNMENT: {
            copy->data.assignment.name = malloc(strlen(node->data.assignment.name) + 1);
            strcpy(copy->data.assignment.name, node->data.assignment.name);
            copy->data.assignment.value = ast_copy_node(node->data.assignment.value);
            break;
        }
        case NODE_IDENTIFIER: {
            copy->data.identifier.name = malloc(strlen(node->data.identifier.name) + 1);
            strcpy(copy->data.identifier.name, node->data.identifier.name);
            break;
        }
        case NODE_STRING_LITERAL: {
            copy->data.string_literal.value = malloc(strlen(node->data.string_literal.value) + 1);
            strcpy(copy->data.string_literal.value, node->data.string_literal.value);
            break;
        }
        case NODE_CALL: {
            copy->data.call.name = malloc(strlen(node->data.call.name) + 1);
            strcpy(copy->data.call.name, node->data.call.name);
            copy->data.call.arg_count = node->data.call.arg_count;
            if (node->data.call.arg_count > 0) {
                copy->data.call.args = malloc(node->data.call.arg_count * sizeof(ASTNode*));
                for (int i = 0; i < node->data.call.arg_count; i++) {
                    copy->data.call.args[i] = ast_copy_node(node->data.call.args[i]);
                }
            } else {
                copy->data.call.args = NULL;
            }
            break;
        }
        case NODE_BINARY_OP: {
            copy->data.binary_op.left = ast_copy_node(node->data.binary_op.left);
            copy->data.binary_op.right = ast_copy_node(node->data.binary_op.right);
            copy->data.binary_op.op = malloc(strlen(node->data.binary_op.op) + 1);
            strcpy(copy->data.binary_op.op, node->data.binary_op.op);
            break;
        }
        case NODE_UNARY_OP: {
            copy->data.unary_op.operand = ast_copy_node(node->data.unary_op.operand);
            copy->data.unary_op.op = malloc(strlen(node->data.unary_op.op) + 1);
            strcpy(copy->data.unary_op.op, node->data.unary_op.op);
            break;
        }
        case NODE_RETURN_STMT:
            copy->data.return_stmt.value = ast_copy_node(node->data.return_stmt.value);
            break;
        case NODE_PRINT_STMT:
            copy->data.print_stmt.value = ast_copy_node(node->data.print_stmt.value);
            break;
        case NODE_IF_STMT:
            copy->data.if_stmt.condition = ast_copy_node(node->data.if_stmt.condition);
            copy->data.if_stmt.then_branch = ast_copy_node(node->data.if_stmt.then_branch);
            copy->data.if_stmt.else_branch = ast_copy_node(node->data.if_stmt.else_branch);
            break;
        case NODE_WHILE_STMT:
            copy->data.while_stmt.condition = ast_copy_node(node->data.while_stmt.condition);
            copy->data.while_stmt.body = ast_copy_node(node->data.while_stmt.body);
            break;
        case NODE_BLOCK:
        case NODE_PROGRAM:
            // Already handled above
            break;
        case NODE_INT_LITERAL:
        case NODE_BOOL_LITERAL:
            copy->data = node->data;
            break;
        case NODE_ARRAY_LITERAL: {
            copy->data.array_literal.element_count = node->data.array_literal.element_count;
            if (node->data.array_literal.element_count > 0) {
                copy->data.array_literal.elements = malloc(node->data.array_literal.element_count * sizeof(ASTNode*));
                for (int i = 0; i < node->data.array_literal.element_count; i++) {
                    copy->data.array_literal.elements[i] = ast_copy_node(node->data.array_literal.elements[i]);
                }
            } else {
                copy->data.array_literal.elements = NULL;
            }
            break;
        }
        case NODE_ARRAY_INDEX:
            copy->data.array_index.array = ast_copy_node(node->data.array_index.array);
            copy->data.array_index.index = ast_copy_node(node->data.array_index.index);
            break;
        case NODE_TRY:
            copy->data.try_stmt.try_block = ast_copy_node(node->data.try_stmt.try_block);
            copy->data.try_stmt.catch_block = ast_copy_node(node->data.try_stmt.catch_block);
            copy->data.try_stmt.finally_block = ast_copy_node(node->data.try_stmt.finally_block);
            copy->data.try_stmt.catch_name = NULL;
            if (node->data.try_stmt.catch_name) {
                copy->data.try_stmt.catch_name = malloc(strlen(node->data.try_stmt.catch_name) + 1);
                strcpy(copy->data.try_stmt.catch_name, node->data.try_stmt.catch_name);
            }
            break;
        case NODE_THROW:
            copy->data.throw_stmt.message = malloc(strlen(node->data.throw_stmt.message) + 1);
            strcpy(copy->data.throw_stmt.message, node->data.throw_stmt.message);
            break;
        default:
            copy->data = node->data;
            break;
    }
    
    return copy;
}

// Recursively walk AST and rewrite std/ function call names to use prefix
void rewrite_std_calls(ASTNode *node, char **std_names, int std_count) {
    if (!node) return;
    switch (node->type) {
        case NODE_CALL: {
            for (int i = 0; i < std_count; i++) {
                if (strcmp(node->data.call.name, std_names[i]) == 0) {
                    size_t orig_len = strlen(node->data.call.name);
                    char *prefixed = malloc(orig_len + 10);
                    sprintf(prefixed, "YAP_STD_%s", node->data.call.name);
                    free(node->data.call.name);
                    node->data.call.name = prefixed;
                    break;
                }
            }
            for (int i = 0; i < node->data.call.arg_count; i++) {
                rewrite_std_calls(node->data.call.args[i], std_names, std_count);
            }
            break;
        }
        case NODE_VAR_DECL:
            rewrite_std_calls(node->data.var_decl.value, std_names, std_count);
            break;
        case NODE_ASSIGNMENT:
            rewrite_std_calls(node->data.assignment.value, std_names, std_count);
            break;
        case NODE_PRINT_STMT:
            rewrite_std_calls(node->data.print_stmt.value, std_names, std_count);
            break;
        case NODE_IF_STMT:
            rewrite_std_calls(node->data.if_stmt.condition, std_names, std_count);
            rewrite_std_calls(node->data.if_stmt.then_branch, std_names, std_count);
            rewrite_std_calls(node->data.if_stmt.else_branch, std_names, std_count);
            break;
        case NODE_WHILE_STMT:
            rewrite_std_calls(node->data.while_stmt.condition, std_names, std_count);
            rewrite_std_calls(node->data.while_stmt.body, std_names, std_count);
            break;
        case NODE_RETURN_STMT:
            rewrite_std_calls(node->data.return_stmt.value, std_names, std_count);
            break;
        case NODE_FUNC_DECL:
            rewrite_std_calls(node->data.func_decl.body, std_names, std_count);
            break;
        case NODE_BINARY_OP:
            rewrite_std_calls(node->data.binary_op.left, std_names, std_count);
            rewrite_std_calls(node->data.binary_op.right, std_names, std_count);
            break;
        case NODE_UNARY_OP:
            rewrite_std_calls(node->data.unary_op.operand, std_names, std_count);
            break;
        case NODE_BLOCK:
        case NODE_PROGRAM:
            for (int i = 0; i < node->statement_count; i++) {
                rewrite_std_calls(node->statements[i], std_names, std_count);
            }
            break;
        case NODE_ARRAY_LITERAL:
            for (int i = 0; i < node->data.array_literal.element_count; i++) {
                rewrite_std_calls(node->data.array_literal.elements[i], std_names, std_count);
            }
            break;
        case NODE_ARRAY_INDEX:
            rewrite_std_calls(node->data.array_index.array, std_names, std_count);
            rewrite_std_calls(node->data.array_index.index, std_names, std_count);
            break;
        case NODE_TRY:
            rewrite_std_calls(node->data.try_stmt.try_block, std_names, std_count);
            rewrite_std_calls(node->data.try_stmt.catch_block, std_names, std_count);
            rewrite_std_calls(node->data.try_stmt.finally_block, std_names, std_count);
            break;
        case NODE_THROW:
        case NODE_INT_LITERAL:
        case NODE_STRING_LITERAL:
        case NODE_BOOL_LITERAL:
        case NODE_IDENTIFIER:
        case NODE_IMPORT:
        default:
            break;
    }
}

// Process imports recursively: load files, parse them, and collect exported functions
int process_imports(ASTNode *program, ASTNode ***imported_functions, int *imported_count, const char *base_dir) {
    if (!program || program->type != NODE_PROGRAM) {
        return 0;
    }
    
    int result = 0;
    
    for (int i = 0; i < program->statement_count; i++) {
        ASTNode *stmt = program->statements[i];
        
        if (stmt->type == NODE_IMPORT) {
            // Load and parse the imported module
            // Resolve import path relative to base_dir
            const char *mod = stmt->data.import_stmt.module_path;
            char *source = NULL;
            if (strncmp(mod, "std/", 4) == 0) {
                // Use read_file directly for std/ imports (handles $YAP_STD_PATH)
                source = read_file(mod);
            } else if (strncmp(mod, "./", 2) == 0) {
                char resolved_path[512];
                snprintf(resolved_path, sizeof(resolved_path), "%s/%s", base_dir, mod+2);
                source = read_file(resolved_path);
            } else if (mod[0] == '/') {
                source = read_file(mod);
            } else {
                char resolved_path[512];
                snprintf(resolved_path, sizeof(resolved_path), "%s/%s", base_dir, mod);
                source = read_file(resolved_path);
            }
            if (!source) {
                fprintf(stderr, "Error: Could not load imported module '%s'\n", mod);
                return 1;
            }
            
            Parser *import_parser = parser_create(source);
            ASTNode *imported_program = parser_parse(import_parser);
            
            if (import_parser->error) {
                fprintf(stderr, "Parse error in imported module '%s': %s\n", mod, import_parser->error_msg);
                parser_destroy(import_parser);
                free(source);
                return 1;
            }
            
            // If selective imports, track which functions to include
            int include_all = (stmt->data.import_stmt.import_count == 0);
            int is_std_import = (strncmp(mod, "std/", 4) == 0);
            char **std_names = NULL;
            int std_count = 0;

            // Collect exported functions
            if (imported_program && imported_program->type == NODE_PROGRAM) {
                for (int j = 0; j < imported_program->statement_count; j++) {
                    ASTNode *imported_stmt = imported_program->statements[j];
                    if (imported_stmt->type == NODE_FUNC_DECL) {
                        int should_include = include_all;
                        // If selective import, check if this function is in the import list
                        if (!include_all) {
                            for (int k = 0; k < stmt->data.import_stmt.import_count; k++) {
                                if (strcmp(imported_stmt->data.func_decl.name, stmt->data.import_stmt.imports[k]) == 0) {
                                    should_include = 1;
                                    break;
                                }
                            }
                        }
                        if (should_include && imported_stmt->data.func_decl.is_exported) {
                            ASTNode *copy = ast_copy_node(imported_stmt);
                            if (is_std_import) {
                                size_t orig_len = strlen(copy->data.func_decl.name);
                                char *prefixed = malloc(orig_len + 10);
                                sprintf(prefixed, "YAP_STD_%s", copy->data.func_decl.name);
                                free(copy->data.func_decl.name);
                                copy->data.func_decl.name = prefixed;
                                // Track std/ function name for call rewriting
                                std_names = realloc(std_names, (std_count + 1) * sizeof(char*));
                                std_names[std_count] = strdup(imported_stmt->data.func_decl.name);
                                std_count++;
                            }
                            *imported_functions = realloc(*imported_functions, (*imported_count + 1) * sizeof(ASTNode*));
                            (*imported_functions)[*imported_count] = copy;
                            (*imported_count)++;
                        }
                    }
                }
            }
            // After import, rewrite all call sites in the main program to use the prefix
            if (is_std_import && std_count > 0) {
                rewrite_std_calls(program, std_names, std_count);
                for (int i = 0; i < std_count; i++) free(std_names[i]);
                free(std_names);
            }
            
            // Free the imported program and parser
            // Note: We DON'T call ast_free on imported_program because we've already
            // copied the nodes we need. Just free the parser and source.
            // The statements array in imported_program will be freed, but the individual
            // function nodes are now owned by the copies we made.
            imported_program->statements = NULL;  // Prevent ast_free from freeing statement pointers
            imported_program->statement_count = 0;
            ast_free(imported_program);
            parser_destroy(import_parser);
            free(source);
        }
    }
    
    return result;
}

// Merge imported functions into the program
void merge_imports(ASTNode *program, ASTNode **imported_functions, int imported_count) {
    if (!program || program->type != NODE_PROGRAM) {
        return;
    }
    
    // Filter out import statements and collect non-import statements
    ASTNode **new_statements = malloc((program->statement_count + imported_count) * sizeof(ASTNode*));
    int new_count = 0;
    
    for (int i = 0; i < program->statement_count; i++) {
        if (program->statements[i]->type != NODE_IMPORT) {
            new_statements[new_count++] = program->statements[i];
        }
    }
    
    // Add imported functions at the beginning (before main code)
    for (int i = 0; i < imported_count; i++) {
        // Prepend imported functions
        // Shift existing statements
        for (int j = new_count; j > 0; j--) {
            new_statements[j] = new_statements[j-1];
        }
        new_statements[0] = imported_functions[i];
        new_count++;
    }
    
    if (program->statements) {
        free(program->statements);
    }
    program->statements = new_statements;
    program->statement_count = new_count;
}

static Value build_args_value(int arg_count, char **args) {
    ArrayValue *arr = malloc(sizeof(ArrayValue));
    if (!arr) {
        return value_create_null();
    }

    arr->ref_count = 1;
    arr->length = arg_count;
    arr->capacity = arg_count;
    arr->items = NULL;
    if (arg_count > 0) {
        arr->items = malloc(sizeof(Value) * arg_count);
        if (!arr->items) {
            free(arr);
            return value_create_null();
        }
        for (int i = 0; i < arg_count; i++) {
            arr->items[i] = value_create_string(args[i]);
        }
    }

    return value_create_array(arr);
}

void run_file(const char *filename, int arg_count, char **args) {
    char *source = read_file(filename);
    if (!source) return;
    
    Parser *parser = parser_create(source);
    ASTNode *program = parser_parse(parser);
    
    if (parser->error) {
        fprintf(stderr, "Parse error: %s\n", parser->error_msg);
        parser_destroy(parser);
        free(source);
        return;
    }

    // Process imports for interpreter mode
    ASTNode **imported_functions = NULL;
    int imported_count = 0;
    if (process_imports(program, &imported_functions, &imported_count, ".") != 0) {
        fprintf(stderr, "Import processing failed\n");
        ast_free(program);
        parser_destroy(parser);
        free(source);
        return;
    }
    merge_imports(program, imported_functions, imported_count);
    if (imported_functions) {
        free(imported_functions);
    }
    
    Interpreter *interp = interpreter_create();
    if (arg_count > 0) {
        Value args_val = build_args_value(arg_count, args);
        interpreter_define_global(interp, "args", args_val);
    }
    interpreter_execute(interp, program);
    
    ast_free(program);
    interpreter_destroy(interp);
    parser_destroy(parser);
    free(source);
}

void run_interactive() {
    printf("YAP Language v1.0 - Interactive Mode\n");
    printf("Type 'exit' to quit\n\n");
    
    char buffer[4096];
    
    while (1) {
        printf("> ");
        if (!fgets(buffer, sizeof(buffer), stdin)) break;
        
        if (strcmp(buffer, "exit\n") == 0) break;
        
        Parser *parser = parser_create(buffer);
        ASTNode *program = parser_parse(parser);
        
        if (parser->error) {
            fprintf(stderr, "Error: %s\n", parser->error_msg);
        } else {
            Interpreter *interp = interpreter_create();
            interpreter_execute(interp, program);
            interpreter_destroy(interp);
        }
        
        ast_free(program);
        parser_destroy(parser);
    }
}

int main(int argc, char *argv[]) {
    int compile_mode = 0;
    int transpile_c_mode = 0;
    const char *input_path = NULL;
    const char *output_path = NULL;
    int args_start = -1;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--compile") == 0) {
            compile_mode = 1;
        } else if (strcmp(argv[i], "--transpile-c") == 0) {
            transpile_c_mode = 1;
        } else if (strcmp(argv[i], "-o") == 0) {
            if (i + 1 < argc) {
                output_path = argv[++i];
            } else {
                fprintf(stderr, "Error: -o requires an output path\n");
                return 1;
            }
        } else if (!input_path) {
            input_path = argv[i];
        } else {
            args_start = i;
            break;
        }
    }

    if (transpile_c_mode) {
        if (!input_path || args_start != -1) {
            fprintf(stderr, "Usage: %s --transpile-c [filename] [-o output]\n", argv[0]);
            return 1;
        }

        char *source = read_file(input_path);
        if (!source) return 1;

        Parser *parser = parser_create(source);
        ASTNode *program = parser_parse(parser);
        if (parser->error) {
            fprintf(stderr, "Parse error: %s\n", parser->error_msg);
            parser_destroy(parser);
            free(source);
            return 1;
        }

        // Extract directory from input_path for import resolution
        char base_dir[512];
        const char *last_slash = strrchr(input_path, '/');
        if (!last_slash) last_slash = strrchr(input_path, '\\');
        if (last_slash) {
            size_t dir_len = last_slash - input_path;
            strncpy(base_dir, input_path, dir_len);
            base_dir[dir_len] = '\0';
        } else {
            strcpy(base_dir, ".");
        }
        ASTNode **imported_functions = NULL;
        int imported_count = 0;
        if (process_imports(program, &imported_functions, &imported_count, base_dir) != 0) {
            fprintf(stderr, "Import processing failed\n");
            ast_free(program);
            parser_destroy(parser);
            free(source);
            return 1;
        }
        merge_imports(program, imported_functions, imported_count);
        if (imported_functions) {
            free(imported_functions);
        }

        char error[256];
        int rc = compiler_transpile_to_c(program, output_path ? output_path : "out.c", error, sizeof(error));
        if (rc != 0) {
            fprintf(stderr, "Transpile error: %s\n", error);
        }

        ast_free(program);
        parser_destroy(parser);
        free(source);

        return rc != 0 ? 1 : 0;
    }

    if (compile_mode) {
        if (!input_path || args_start != -1) {
            fprintf(stderr, "Usage: %s --compile [filename] [-o output]\n", argv[0]);
            return 1;
        }

        char *source = read_file(input_path);
        if (!source) return 1;

        Parser *parser = parser_create(source);
        ASTNode *program = parser_parse(parser);
        if (parser->error) {
            fprintf(stderr, "Parse error: %s\n", parser->error_msg);
            parser_destroy(parser);
            free(source);
            return 1;
        }

        // Process imports
        ASTNode **imported_functions = NULL;
        int imported_count = 0;
        if (process_imports(program, &imported_functions, &imported_count, ".") != 0) {
            fprintf(stderr, "Import processing failed\n");
            ast_free(program);
            parser_destroy(parser);
            free(source);
            return 1;
        }
        
        // Merge imported functions into the program
        merge_imports(program, imported_functions, imported_count);
        if (imported_functions) {
            free(imported_functions);
        }

        char error[256];
        int rc = compiler_compile(program, output_path, error, sizeof(error));
        if (rc != 0) {
            fprintf(stderr, "Compile error: %s\n", error);
        }

        ast_free(program);
        parser_destroy(parser);
        free(source);

        return rc != 0 ? 1 : 0;
    }

    if (argc == 1) {
        run_interactive();
    } else if (input_path) {
        int arg_count = args_start == -1 ? 0 : (argc - args_start);
        char **args = args_start == -1 ? NULL : &argv[args_start];
        run_file(input_path, arg_count, args);
    } else {
        fprintf(stderr, "Usage: %s [filename] [args...]\n", argv[0]);
        return 1;
    }
    
    return 0;
}
