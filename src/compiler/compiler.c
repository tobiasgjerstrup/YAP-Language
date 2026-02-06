#include "compiler/compiler.h"
#include "compiler/analysis.h"
#include "compiler/emit.h"
#include "compiler/emit_runtime.h"
#include <stdlib.h>
#include <string.h>

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

    for (int i = 0; i < cg->function_count; i++) {
        FunctionDef *func = &cg->functions[i];
        free_locals(cg);

        for (int j = 0; j < func->param_count; j++) {
            add_local(cg, func->params[j]);
        }

        if (func->param_types) {
            for (int j = 0; j < func->param_count; j++) {
                set_local_type(cg, func->params[j], func->param_types[j]);
            }
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

    collect_locals(cg, program);

    int raw_stack = cg->local_count * 8;
    cg->stack_size = ((raw_stack + 15) / 16 * 16) + 8;
    if (cg->stack_size > 0) {
        emit(cg, "    sub rsp, %d\n", cg->stack_size);
    }

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
#ifdef _WIN32
    if (error && error_size) {
        snprintf(error, error_size, "Compile mode is not supported on Windows yet. Use interpreter mode instead.");
    }
    return 1;
#endif
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
    cg.label_counter = 1;

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

    int changed = 0;
    do {
        changed = 0;
        infer_param_types(&cg, program, NULL, &changed);
    } while (changed);

    if (emit_assembly(&cg, program, asm_path) != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "%s", cg.error);
        }
        return 1;
    }

    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "gcc -no-pie -o %s %s src/compiler/runtime_sqlite.c -lsqlite3", out_path, asm_path);
    int rc = system(cmd);

    if (rc != 0) {
        if (error && error_size) {
            snprintf(error, error_size, "Toolchain failed while linking %s", out_path);
        }
        return 1;
    }

    return 0;
}
