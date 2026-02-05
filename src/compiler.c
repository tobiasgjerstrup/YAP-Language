#include "compiler.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#define MAX_LOCALS 256
#define MAX_LABELS 1024
#define MAX_FUNCTIONS 256
#define MAX_STRINGS 256

typedef enum { TYPE_INT = 0, TYPE_STRING = 1, TYPE_BOOL = 2, TYPE_ARRAY = 3 } VarType;

typedef struct {
    char *name;
    int offset;
    VarType type;
} Local;

typedef struct {
    char *name;
    ASTNode *body;
    char **params;
    int param_count;
} FunctionDef;

typedef struct {
    char *value;
    int label_id;
} StringConstant;

typedef struct {
    FILE *out;
    Local locals[MAX_LOCALS];
    int local_count;
    int label_counter;
    int stack_size;
    char error[256];
    int has_error;
    FunctionDef functions[MAX_FUNCTIONS];
    int function_count;
    StringConstant strings[MAX_STRINGS];
    int string_count;
    const char *current_function_name;
} Codegen;

static void set_error(Codegen *cg, ASTNode *node, const char *fmt, ...) {
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

static void emit(Codegen *cg, const char *fmt, ...) {
    va_list args;
    va_start(args, fmt);
    vfprintf(cg->out, fmt, args);
    va_end(args);
}

static int get_label(Codegen *cg) {
    if (cg->label_counter >= MAX_LABELS - 1) {
        set_error(cg, NULL, "Too many labels");
        return -1;
    }
    return cg->label_counter++;
}

static int find_local(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->local_count; i++) {
        if (strcmp(cg->locals[i].name, name) == 0) return i;
    }
    return -1;
}

static int add_local(Codegen *cg, const char *name) {
    int existing = find_local(cg, name);
    if (existing >= 0) return existing;
    if (cg->local_count >= MAX_LOCALS) return -1;
    cg->locals[cg->local_count].name = malloc(strlen(name) + 1);
    strcpy(cg->locals[cg->local_count].name, name);
    cg->locals[cg->local_count].offset = (cg->local_count + 1) * 8;
    cg->locals[cg->local_count].type = TYPE_INT;  // Default to int
    return cg->local_count++;
}

static void set_local_type(Codegen *cg, const char *name, VarType type) {
    int idx = find_local(cg, name);
    if (idx >= 0) {
        cg->locals[idx].type = type;
    }
}

static VarType get_local_type(Codegen *cg, const char *name) {
    int idx = find_local(cg, name);
    if (idx >= 0) {
        return cg->locals[idx].type;
    }
    return TYPE_INT;  // Default
}

static void free_locals(Codegen *cg) {
    for (int i = 0; i < cg->local_count; i++) {
        free(cg->locals[i].name);
    }
    cg->local_count = 0;
}

static FunctionDef* find_function(Codegen *cg, const char *name) {
    for (int i = 0; i < cg->function_count; i++) {
        if (strcmp(cg->functions[i].name, name) == 0) {
            return &cg->functions[i];
        }
    }
    return NULL;
}

static int find_string(Codegen *cg, const char *value) {
    for (int i = 0; i < cg->string_count; i++) {
        if (strcmp(cg->strings[i].value, value) == 0) {
            return cg->strings[i].label_id;
        }
    }
    return -1;
}

static int add_string(Codegen *cg, const char *value) {
    int existing = find_string(cg, value);
    if (existing >= 0) return existing;
    if (cg->string_count >= MAX_STRINGS) return -1;
    cg->strings[cg->string_count].value = malloc(strlen(value) + 1);
    strcpy(cg->strings[cg->string_count].value, value);
    cg->strings[cg->string_count].label_id = get_label(cg);
    return cg->strings[cg->string_count++].label_id;
}

static void prepass_strings(Codegen *cg, ASTNode *node) {
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

static void prepass_functions(Codegen *cg, ASTNode *node) {
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
            if (node->data.func_decl.param_count > 0) {
                cg->functions[cg->function_count].params = malloc(sizeof(char*) * node->data.func_decl.param_count);
                for (int i = 0; i < node->data.func_decl.param_count; i++) {
                    cg->functions[cg->function_count].params[i] = malloc(strlen(node->data.func_decl.params[i]) + 1);
                    strcpy(cg->functions[cg->function_count].params[i], node->data.func_decl.params[i]);
                }
            }
            cg->function_count++;
            break;
        default:
            break;
    }
}

static void collect_locals(Codegen *cg, ASTNode *node) {
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

static void gen_expr(Codegen *cg, ASTNode *node);
static void gen_stmt(Codegen *cg, ASTNode *node);

static VarType expr_is_string(Codegen *cg, ASTNode *node) {
    if (!node) return TYPE_INT;
    if (node->type == NODE_STRING_LITERAL) return TYPE_STRING;
    if (node->type == NODE_BOOL_LITERAL) return TYPE_BOOL;
    if (node->type == NODE_ARRAY_LITERAL) return TYPE_ARRAY;
    if (node->type == NODE_ARRAY_INDEX) {
        // Special case: args[index] is a string
        if (node->data.array_index.array && node->data.array_index.array->type == NODE_IDENTIFIER) {
            if (strcmp(node->data.array_index.array->data.identifier.name, "args") == 0) {
                return TYPE_STRING;
            }
        }
        return TYPE_INT;  // Default element type
    }
    if (node->type == NODE_IDENTIFIER) return get_local_type(cg, node->data.identifier.name);
    if (node->type == NODE_BINARY_OP) {
        const char *op = node->data.binary_op.op;
        // Comparison and logical operators return booleans
        if (strcmp(op, "<") == 0 || strcmp(op, "<=") == 0 ||
            strcmp(op, ">") == 0 || strcmp(op, ">=") == 0 ||
            strcmp(op, "==") == 0 || strcmp(op, "!=") == 0 ||
            strcmp(op, "&&") == 0 || strcmp(op, "||") == 0) {
            return TYPE_BOOL;
        }
        // String concatenation: if operator is + and either operand is string, result is string
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
    }
    return TYPE_INT;
}

static void gen_binary_op(Codegen *cg, ASTNode *node) {
    const char *op = node->data.binary_op.op;
    
    // Handle short-circuit && and ||
    if (strcmp(op, "&&") == 0) {
        gen_expr(cg, node->data.binary_op.left);
        emit(cg, "    cmp rax, 0\n");
        int false_label = get_label(cg);
        int end_label = get_label(cg);
        emit(cg, "    je .L%d\n", false_label);
        
        // Left side is true, evaluate right side
        gen_expr(cg, node->data.binary_op.right);
        emit(cg, "    cmp rax, 0\n");
        emit(cg, "    setne al\n");
        emit(cg, "    movzx rax, al\n");
        emit(cg, "    jmp .L%d\n", end_label);
        
        // Left side is false
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
        
        // Left side is false, evaluate right side
        gen_expr(cg, node->data.binary_op.right);
        emit(cg, "    cmp rax, 0\n");
        emit(cg, "    setne al\n");
        emit(cg, "    movzx rax, al\n");
        emit(cg, "    jmp .L%d\n", end_label);
        
        // Left side is true
        emit(cg, ".L%d:\n", true_label);
        emit(cg, "    mov rax, 1\n");
        emit(cg, ".L%d:\n", end_label);
        return;
    }
    
    // Regular binary operations
    gen_expr(cg, node->data.binary_op.left);
    emit(cg, "    push rax\n");
    gen_expr(cg, node->data.binary_op.right);
    emit(cg, "    pop rcx\n");

    if (strcmp(op, "+") == 0) {
        VarType left_type = expr_is_string(cg, node->data.binary_op.left);
        VarType right_type = expr_is_string(cg, node->data.binary_op.right);
        
        if (left_type == TYPE_STRING || right_type == TYPE_STRING) {
            // String concatenation: call yap_concat_strings(rcx, rax)
            // rax = right_val, rcx = left_val
            emit(cg, "    mov rdi, rcx\n");        // arg1 = left
            emit(cg, "    mov rsi, rax\n");        // arg2 = right
            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call yap_concat_strings\n");
        } else {
            // Integer addition
            emit(cg, "    add rax, rcx\n");
        }
        return;
    }

    if (strcmp(op, "-") == 0) {
        emit(cg, "    sub rcx, rax\n");
        emit(cg, "    mov rax, rcx\n");
        return;
    }

    if (strcmp(op, "*") == 0) {
        emit(cg, "    imul rax, rcx\n");
        return;
    }

    if (strcmp(op, "/") == 0 || strcmp(op, "%") == 0) {
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

static void gen_expr(Codegen *cg, ASTNode *node) {
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
            // Array layout: [length | elem0 | elem1 | ...]
            int elem_count = node->data.array_literal.element_count;
            int total_size = (elem_count + 1) * 8;  // length + elements
            
            // malloc(total_size)
            emit(cg, "    mov rdi, %d\n", total_size);
            emit(cg, "    call malloc@PLT\n");
            emit(cg, "    push rax\n");  // Save array pointer
            
            // Store length at offset 0
            emit(cg, "    mov rcx, [rsp]\n");  // Get array pointer
            emit(cg, "    mov QWORD PTR [rcx], %d\n", elem_count);  // Store length
            
            // Store elements starting at offset 8
            for (int i = 0; i < elem_count; i++) {
                gen_expr(cg, node->data.array_literal.elements[i]);
                emit(cg, "    mov rcx, [rsp]\n");  // Get array pointer
                emit(cg, "    mov QWORD PTR [rcx + %d], rax\n", (i + 1) * 8);  // Store element
            }
            
            emit(cg, "    pop rax\n");  // Return array pointer
            return;
        }
        case NODE_ARRAY_INDEX: {
            // array[index] -> load from array
            gen_expr(cg, node->data.array_index.array);
            emit(cg, "    push rax\n");  // Save array pointer
            gen_expr(cg, node->data.array_index.index);
            emit(cg, "    mov rcx, rax\n");  // rcx = index
            emit(cg, "    pop rax\n");   // Get array pointer
            // Load: array[index] = *(array + (index + 1) * 8)
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
            // Check for built-in array functions
            if (strcmp(node->data.call.name, "push") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "push() expects 2 arguments: array and value");
                    return;
                }
                // push(array, value)
                // rdi = array ptr
                // rsi = value
                // Returns new array ptr (or same if capacity available)
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");  // Save array ptr
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");  // rsi = value
                emit(cg, "    pop rdi\n");       // rdi = array ptr
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_array_push\n");
                return;
            }
            
            if (strcmp(node->data.call.name, "pop") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "pop() expects 1 argument: array");
                    return;
                }
                // pop(array) - returns popped value
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");  // rdi = array ptr
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_array_pop\n");
                return;
            }
            
            // File I/O built-ins
            if (strcmp(node->data.call.name, "read") == 0) {
                if (node->data.call.arg_count != 1) {
                    set_error(cg, node, "read() expects 1 argument: filename");
                    return;
                }
                // read(filename) - returns file contents as string
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    mov rdi, rax\n");  // rdi = filename
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_read\n");
                // rax now contains pointer to string (or NULL on error)
                return;
            }
            
            if (strcmp(node->data.call.name, "write") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "write() expects 2 arguments: filename, content");
                    return;
                }
                // write(filename, content) - returns 0 on success
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");  // Save filename
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");  // rsi = content
                emit(cg, "    pop rdi\n");       // rdi = filename
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_write\n");
                return;
            }
            
            if (strcmp(node->data.call.name, "append") == 0) {
                if (node->data.call.arg_count != 2) {
                    set_error(cg, node, "append() expects 2 arguments: filename, content");
                    return;
                }
                // append(filename, content) - returns 0 on success
                gen_expr(cg, node->data.call.args[0]);
                emit(cg, "    push rax\n");  // Save filename
                gen_expr(cg, node->data.call.args[1]);
                emit(cg, "    mov rsi, rax\n");  // rsi = content
                emit(cg, "    pop rdi\n");       // rdi = filename
                emit(cg, "    xor eax, eax\n");
                emit(cg, "    call yap_file_append\n");
                return;
            }
            
            // User-defined function
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
            // SysV ABI: rdi, rsi, rdx, rcx, r8, r9
            static const char *arg_regs[] = {"rdi", "rsi", "rdx", "rcx", "r8", "r9"};
            
            // Evaluate all arguments first, pushing to stack to avoid clobbering
            for (int i = 0; i < node->data.call.arg_count; i++) {
                gen_expr(cg, node->data.call.args[i]);
                emit(cg, "    push rax\n");
            }
            
            // Pop arguments into registers in reverse order
            for (int i = node->data.call.arg_count - 1; i >= 0; i--) {
                if (i < 6) {
                    emit(cg, "    pop %s\n", arg_regs[i]);
                } else {
                    emit(cg, "    pop rax\n");
                }
            }
            
            emit(cg, "    xor eax, eax\n");
            emit(cg, "    call %s\n", node->data.call.name);
            return;
        }
        default:
            set_error(cg, node, "Unsupported expression node");
            return;
    }
}

static void gen_print(Codegen *cg, ASTNode *node) {
    VarType print_type = expr_is_string(cg, node->data.print_stmt.value);
    gen_expr(cg, node->data.print_stmt.value);
    emit(cg, "    mov rsi, rax\n");
    
    if (print_type == TYPE_STRING) {
        // Print string: use puts
        emit(cg, "    mov rdi, rsi\n");           // arg = string pointer
        emit(cg, "    xor eax, eax\n");
        emit(cg, "    call puts@PLT\n");          // puts prints string and newline
    } else {
        // Print integer: use printf with %ld format
        emit(cg, "    lea rdi, [rip + .LC0]\n");
        emit(cg, "    xor eax, eax\n");
        emit(cg, "    call printf@PLT\n");
    }
}

static void gen_stmt(Codegen *cg, ASTNode *node) {
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
            // Determine type from initialization value
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
            // Update type based on assigned value
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
            // Function declarations are handled separately
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

static void emit_string_section(Codegen *cg) {
    emit(cg, ".section .rodata\n");
    emit(cg, ".LC0:\n");
    emit(cg, "    .string \"%%ld\\n\"\n");
    
    // File mode strings for I/O
    emit(cg, ".filemode_r:\n");
    emit(cg, "    .string \"r\"\n");
    emit(cg, ".filemode_w:\n");
    emit(cg, "    .string \"w\"\n");
    emit(cg, ".filemode_a:\n");
    emit(cg, "    .string \"a\"\n");
    
    for (int i = 0; i < cg->string_count; i++) {
        emit(cg, ".LC%d:\n", cg->strings[i].label_id);
        emit(cg, "    .string \"");
        for (const char *p = cg->strings[i].value; *p; p++) {
            if (*p == '"') emit(cg, "\\\"");
            else if (*p == '\\') emit(cg, "\\\\");
            else if (*p == '\n') emit(cg, "\\n");
            else if (*p == '\t') emit(cg, "\\t");
            else emit(cg, "%c", *p);
        }
        emit(cg, "\"\n");
    }
}

static void emit_runtime_helpers(Codegen *cg) {
    // yap_concat_strings(rdi=str1, rsi=str2) -> rax=result (malloc'd)
    emit(cg, "\n.globl yap_concat_strings\n");
    emit(cg, ".type yap_concat_strings, @function\n");
    emit(cg, "yap_concat_strings:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");             // Align stack
    
    // rdi = str1, rsi = str2 (SysV ABI)
    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");
    
    // Get total length: len1 + len2 + 1
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r8, rax\n");
    
    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call strlen@PLT\n");
    
    emit(cg, "    add rax, r8\n");
    emit(cg, "    add rax, 1\n");
    
    // malloc(total_len)
    emit(cg, "    mov rdi, rax\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    
    // strcpy(result, str1)
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    mov rsi, r12\n");
    emit(cg, "    call strcpy@PLT\n");
    
    // strcat(result, str2)
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    mov rsi, r13\n");
    emit(cg, "    call strcat@PLT\n");
    
    emit(cg, "    mov rax, rbx\n");
    
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    // yap_array_push(rdi=array_ptr, rsi=value) -> rax=new_array_ptr
    emit(cg, "\n.globl yap_array_push\n");
    emit(cg, ".type yap_array_push, @function\n");
    emit(cg, "yap_array_push:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    push r14\n");
    emit(cg, "    push r15\n");
    emit(cg, "    sub rsp, 8\n");             // Align stack to 16 bytes before call
    
    // rdi = array_ptr, rsi = value
    emit(cg, "    mov r12, rdi\n");           // r12 = old array_ptr
    emit(cg, "    mov r13, rsi\n");           // r13 = value to push
    
    // Get old length from array[0]
    emit(cg, "    mov r14, [r12]\n");         // r14 = old_length
    
    // Calculate new array size: (length + 1 + 1) * 8 bytes
    // We need: [length_field | elem0 | elem1 | ... | elemN] = (old_length + 2) fields * 8 bytes
    emit(cg, "    mov r15, r14\n");           // r15 = old_length
    emit(cg, "    add r15, 2\n");             // r15 = old_length + 2
    emit(cg, "    imul r15, 8\n");            // r15 = byte size
    
    // Allocate new array
    emit(cg, "    mov rdi, r15\n");           // arg1: size
    emit(cg, "    call malloc@PLT\n");        // rax = new array ptr
    emit(cg, "    mov rbx, rax\n");           // rbx = new array ptr
    
    // Copy old array to new array using memcpy
    // memcpy(dest=new, src=old, count=(old_length+1)*8)
    emit(cg, "    mov rdi, rbx\n");           // arg1: dest
    emit(cg, "    mov rsi, r12\n");           // arg2: src (old array)
    emit(cg, "    mov rdx, r14\n");           // rdx = old_length
    emit(cg, "    add rdx, 1\n");             // rdx = old_length + 1 (length field + old elements)
    emit(cg, "    imul rdx, 8\n");            // rdx = bytes to copy
    emit(cg, "    call memcpy@PLT\n");        // copies data
    
    // Update length in new array
    emit(cg, "    mov rax, r14\n");
    emit(cg, "    add rax, 1\n");             // rax = new_length
    emit(cg, "    mov [rbx], rax\n");         // array[0] = new_length
    
    // Store the new value at array[new_length]
    // Index in array = (old_length + 1) because [0] is length, [1] is first element, etc.
    emit(cg, "    mov rax, r14\n");
    emit(cg, "    add rax, 1\n");             // rax = index into array
    emit(cg, "    mov [rbx + rax*8], r13\n"); // array[index] = value
    
    emit(cg, "    mov rax, rbx\n");           // return new array ptr
    
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r15\n");
    emit(cg, "    pop r14\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    // yap_array_pop(rdi=array_ptr) -> rax=popped_value
    emit(cg, "\n.globl yap_array_pop\n");
    emit(cg, ".type yap_array_pop, @function\n");
    emit(cg, "yap_array_pop:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    
    // rdi = array_ptr
    emit(cg, "    mov rax, [rdi]\n");         // rax = length
    emit(cg, "    cmp rax, 0\n");
    emit(cg, "    jle .pop_empty\n");
    
    // Decrement length
    emit(cg, "    sub rax, 1\n");              // rax = new_length
    emit(cg, "    mov [rdi], rax\n");         // update length
    
    // Return popped value: array[new_length]
    emit(cg, "    mov rax, [rdi + rax*8 + 8]\n");  // return element at index new_length
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    emit(cg, ".pop_empty:\n");
    emit(cg, "    xor eax, eax\n");           // return 0 if array empty
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    // yap_file_read(rdi=filename) -> rax=file contents as string (or null on error)
    // Simple approach: read entire file into a large buffer
    emit(cg, "\n.globl yap_file_read\n");
    emit(cg, ".type yap_file_read, @function\n");
    emit(cg, "yap_file_read:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    sub rsp, 8\n");
    
    // rdi = filename
    emit(cg, "    mov r12, rdi\n");           // r12 = filename
    
    // Allocate a 64KB buffer for reading
    emit(cg, "    mov rdi, 65536\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");           // rbx = buffer
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_read_error\n");
    
    // Open file
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_r]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov r12, rax\n");           // r12 = FILE*
    emit(cg, "    test r12, r12\n");
    emit(cg, "    jz .file_read_error_free\n");
    
    // Read all data using fgets in a loop (simplified: just one read for now)
    emit(cg, "    mov rdi, rbx\n");           // ptr
    emit(cg, "    mov rsi, 65536\n");         // size
    emit(cg, "    mov rdx, r12\n");           // FILE*
    emit(cg, "    call fgets@PLT\n");
    
    // Close file
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    call fclose@PLT\n");
    
    emit(cg, "    mov rax, rbx\n");           // return buffer
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    emit(cg, ".file_read_error_free:\n");
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call free@PLT\n");
    
    emit(cg, ".file_read_error:\n");
    emit(cg, "    xor eax, eax\n");           // return NULL
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    // yap_file_write(rdi=filename, rsi=content) -> rax=0 on success, -1 on error
    emit(cg, "\n.globl yap_file_write\n");
    emit(cg, ".type yap_file_write, @function\n");
    emit(cg, "yap_file_write:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");
    
    // rdi = filename, rsi = content
    emit(cg, "    mov r12, rdi\n");           // r12 = filename
    emit(cg, "    mov r13, rsi\n");           // r13 = content
    
    // Open file in write mode
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_w]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov rbx, rax\n");           // rbx = FILE*
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_write_error\n");
    
    // Get string length
    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r12, rax\n");           // r12 = length
    
    // Write to file: fwrite(ptr, 1, len, FILE*)
    emit(cg, "    mov rdi, r13\n");           // ptr = content
    emit(cg, "    mov rsi, 1\n");             // size = 1
    emit(cg, "    mov rdx, r12\n");           // nmemb = length
    emit(cg, "    mov rcx, rbx\n");           // FILE*
    emit(cg, "    call fwrite@PLT\n");
    
    // Close file
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call fclose@PLT\n");
    
    emit(cg, "    xor eax, eax\n");           // return 0
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    emit(cg, ".file_write_error:\n");
    emit(cg, "    mov eax, -1\n");            // return -1
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    // yap_file_append(rdi=filename, rsi=content) -> rax=0 on success, -1 on error
    emit(cg, "\n.globl yap_file_append\n");
    emit(cg, ".type yap_file_append, @function\n");
    emit(cg, "yap_file_append:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");
    
    // rdi = filename, rsi = content
    emit(cg, "    mov r12, rdi\n");           // r12 = filename
    emit(cg, "    mov r13, rsi\n");           // r13 = content
    
    // Open file in append mode
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_a]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov rbx, rax\n");           // rbx = FILE*
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_append_error\n");
    
    // Get string length
    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r12, rax\n");           // r12 = length
    
    // Write to file: fwrite(ptr, 1, len, FILE*)
    emit(cg, "    mov rdi, r13\n");           // ptr = content
    emit(cg, "    mov rsi, 1\n");             // size = 1
    emit(cg, "    mov rdx, r12\n");           // nmemb = length
    emit(cg, "    mov rcx, rbx\n");           // FILE*
    emit(cg, "    call fwrite@PLT\n");
    
    // Close file
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call fclose@PLT\n");
    
    emit(cg, "    xor eax, eax\n");           // return 0
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    
    emit(cg, ".file_append_error:\n");
    emit(cg, "    mov eax, -1\n");            // return -1
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    // yap_build_args(rdi=argc, rsi=argv) -> rax=args array
    emit(cg, "\n.globl yap_build_args\n");
    emit(cg, ".type yap_build_args, @function\n");
    emit(cg, "yap_build_args:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    push r14\n");
    emit(cg, "    sub rsp, 8\n");

    // rdi = argc, rsi = argv
    emit(cg, "    mov r12, rdi\n");           // r12 = argc
    emit(cg, "    mov r13, rsi\n");           // r13 = argv

    // If argc <= 1, return empty array
    emit(cg, "    cmp r12, 1\n");
    emit(cg, "    jg .args_nonempty\n");
    emit(cg, "    mov rdi, 8\n");             // size for length only
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    emit(cg, "    mov QWORD PTR [rbx], 0\n");
    emit(cg, "    mov rax, rbx\n");
    emit(cg, "    jmp .args_done\n");

    emit(cg, ".args_nonempty:\n");
    // Allocate (argc) * 8 bytes: length + (argc - 1) elements
    emit(cg, "    mov rax, r12\n");
    emit(cg, "    imul rax, 8\n");
    emit(cg, "    mov rdi, rax\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");

    // length = argc - 1
    emit(cg, "    mov rax, r12\n");
    emit(cg, "    sub rax, 1\n");
    emit(cg, "    mov [rbx], rax\n");

    // Copy argv[1..argc-1] into array
    emit(cg, "    mov rcx, 1\n");
    emit(cg, ".args_loop:\n");
    emit(cg, "    cmp rcx, r12\n");
    emit(cg, "    jge .args_done\n");
    emit(cg, "    mov rdx, [r13 + rcx*8]\n");
    emit(cg, "    mov [rbx + rcx*8], rdx\n");
    emit(cg, "    inc rcx\n");
    emit(cg, "    jmp .args_loop\n");

    emit(cg, ".args_done:\n");
    emit(cg, "    mov rax, rbx\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r14\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
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

    // Emit all function definitions FIRST
    for (int i = 0; i < cg->function_count; i++) {
        FunctionDef *func = &cg->functions[i];
        free_locals(cg);
        
        for (int j = 0; j < func->param_count; j++) {
            add_local(cg, func->params[j]);
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

        // Move arguments to stack
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

    // Now emit main
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

    // Collect local variables for main
    for (int i = 0; i < program->statement_count; i++) {
        ASTNode *stmt = program->statements[i];
        if (stmt->type == NODE_VAR_DECL) {
            add_local(cg, stmt->data.var_decl.name);
        } else if (stmt->type == NODE_BLOCK) {
            for (int j = 0; j < stmt->statement_count; j++) {
                if (stmt->statements[j]->type == NODE_VAR_DECL) {
                    add_local(cg, stmt->statements[j]->data.var_decl.name);
                }
            }
        }
    }

    int raw_stack = cg->local_count * 8;
    cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
    if (cg->stack_size > 0) {
        emit(cg, "    sub rsp, %d\n", cg->stack_size);
    }

    // Initialize args from argc/argv
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
    cg.label_counter = 1;  // Reserve .LC0 for printf format string

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

    if (emit_assembly(&cg, program, asm_path) != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "gcc -no-pie -o %s %s", out_path, asm_path);
    int rc = system(cmd);

    if (rc != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "Toolchain failed while linking %s", out_path);
        }
        return 1;
    }

    return 0;
}
