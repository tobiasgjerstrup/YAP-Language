#include "compiler/emit_runtime.h"

void emit_string_section(Codegen *cg) {
    emit(cg, ".section .rodata\n");
    emit(cg, ".LC0:\n");
    emit(cg, "    .string \"%%ld\\n\"\n");
    emit(cg, ".LC_INT_FORMAT:\n");
    emit(cg, "    .string \"%%ld\"\n");
    emit(cg, ".LC_TRUE:\n");
    emit(cg, "    .string \"true\"\n");
    emit(cg, ".LC_FALSE:\n");
    emit(cg, "    .string \"false\"\n");

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

void emit_runtime_helpers(Codegen *cg) {
    emit(cg, "\n.data\n");
    emit(cg, ".align 4\n");
    emit(cg, "yap_rand_seeded:\n");
    emit(cg, "    .long 0\n");
    emit(cg, ".text\n");

    emit(cg, "\n.globl yap_timestamp\n");
    emit(cg, ".type yap_timestamp, @function\n");
    emit(cg, "yap_timestamp:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    sub rsp, 8\n");
    emit(cg, "    xor edi, edi\n");
    emit(cg, "    call time@PLT\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_int_to_string\n");
    emit(cg, ".type yap_int_to_string, @function\n");
    emit(cg, "yap_int_to_string:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");

    emit(cg, "    mov rbx, rdi\n");
    emit(cg, "    mov rdi, 32\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov r12, rax\n");
    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .LC_INT_FORMAT]\n");
    emit(cg, "    mov rdx, rbx\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call sprintf@PLT\n");
    emit(cg, "    mov rax, r12\n");

    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_bool_to_string\n");
    emit(cg, ".type yap_bool_to_string, @function\n");
    emit(cg, "yap_bool_to_string:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    cmp rdi, 0\n");
    emit(cg, "    jne .bool_true\n");
    emit(cg, "    lea rax, [rip + .LC_FALSE]\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");
    emit(cg, ".bool_true:\n");
    emit(cg, "    lea rax, [rip + .LC_TRUE]\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_random\n");
    emit(cg, ".type yap_random, @function\n");
    emit(cg, "yap_random:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    sub rsp, 8\n");
    emit(cg, "    mov eax, DWORD PTR [rip + yap_rand_seeded]\n");
    emit(cg, "    cmp eax, 0\n");
    emit(cg, "    jne .rand_seeded\n");
    emit(cg, "    xor edi, edi\n");
    emit(cg, "    call time@PLT\n");
    emit(cg, "    mov edi, eax\n");
    emit(cg, "    call srand@PLT\n");
    emit(cg, "    mov DWORD PTR [rip + yap_rand_seeded], 1\n");
    emit(cg, ".rand_seeded:\n");
    emit(cg, "    call rand@PLT\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_concat_strings\n");
    emit(cg, ".type yap_concat_strings, @function\n");
    emit(cg, "yap_concat_strings:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");

    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");

    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r8, rax\n");

    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    call strlen@PLT\n");

    emit(cg, "    add rax, r8\n");
    emit(cg, "    add rax, 1\n");

    emit(cg, "    mov rdi, rax\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");

    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    mov rsi, r12\n");
    emit(cg, "    call strcpy@PLT\n");

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
    emit(cg, "    sub rsp, 8\n");

    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");

    emit(cg, "    mov r14, [r12]\n");

    emit(cg, "    mov r15, r14\n");
    emit(cg, "    add r15, 2\n");
    emit(cg, "    imul r15, 8\n");

    emit(cg, "    mov rdi, r15\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");

    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    mov rsi, r12\n");
    emit(cg, "    mov rdx, r14\n");
    emit(cg, "    add rdx, 1\n");
    emit(cg, "    imul rdx, 8\n");
    emit(cg, "    call memcpy@PLT\n");

    emit(cg, "    mov rax, r14\n");
    emit(cg, "    add rax, 1\n");
    emit(cg, "    mov [rbx], rax\n");

    emit(cg, "    mov rax, r14\n");
    emit(cg, "    add rax, 1\n");
    emit(cg, "    mov [rbx + rax*8], r13\n");

    emit(cg, "    mov rax, rbx\n");

    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r15\n");
    emit(cg, "    pop r14\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_array_pop\n");
    emit(cg, ".type yap_array_pop, @function\n");
    emit(cg, "yap_array_pop:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");

    emit(cg, "    mov rax, [rdi]\n");
    emit(cg, "    cmp rax, 0\n");
    emit(cg, "    jle .pop_empty\n");

    emit(cg, "    sub rax, 1\n");
    emit(cg, "    mov [rdi], rax\n");

    emit(cg, "    mov rax, [rdi + rax*8 + 8]\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, ".pop_empty:\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_file_read\n");
    emit(cg, ".type yap_file_read, @function\n");
    emit(cg, "yap_file_read:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    sub rsp, 8\n");

    emit(cg, "    mov r12, rdi\n");

    emit(cg, "    mov rdi, 65536\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_read_error\n");

    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_r]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov r12, rax\n");
    emit(cg, "    test r12, r12\n");
    emit(cg, "    jz .file_read_error_free\n");

    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    mov rsi, 65536\n");
    emit(cg, "    mov rdx, r12\n");
    emit(cg, "    call fgets@PLT\n");

    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    call fclose@PLT\n");

    emit(cg, "    mov rax, rbx\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, ".file_read_error_free:\n");
    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call free@PLT\n");

    emit(cg, ".file_read_error:\n");
    emit(cg, "    xor eax, eax\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_file_write\n");
    emit(cg, ".type yap_file_write, @function\n");
    emit(cg, "yap_file_write:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");

    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");

    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_w]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_write_error\n");

    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r12, rax\n");

    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    mov rsi, 1\n");
    emit(cg, "    mov rdx, r12\n");
    emit(cg, "    mov rcx, rbx\n");
    emit(cg, "    call fwrite@PLT\n");

    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call fclose@PLT\n");

    emit(cg, "    xor eax, eax\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, ".file_write_error:\n");
    emit(cg, "    mov eax, -1\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, "\n.globl yap_file_append\n");
    emit(cg, ".type yap_file_append, @function\n");
    emit(cg, "yap_file_append:\n");
    emit(cg, "    push rbp\n");
    emit(cg, "    mov rbp, rsp\n");
    emit(cg, "    push rbx\n");
    emit(cg, "    push r12\n");
    emit(cg, "    push r13\n");
    emit(cg, "    sub rsp, 8\n");

    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");

    emit(cg, "    mov rdi, r12\n");
    emit(cg, "    lea rsi, [rip + .filemode_a]\n");
    emit(cg, "    call fopen@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    emit(cg, "    test rbx, rbx\n");
    emit(cg, "    jz .file_append_error\n");

    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    call strlen@PLT\n");
    emit(cg, "    mov r12, rax\n");

    emit(cg, "    mov rdi, r13\n");
    emit(cg, "    mov rsi, 1\n");
    emit(cg, "    mov rdx, r12\n");
    emit(cg, "    mov rcx, rbx\n");
    emit(cg, "    call fwrite@PLT\n");

    emit(cg, "    mov rdi, rbx\n");
    emit(cg, "    call fclose@PLT\n");

    emit(cg, "    xor eax, eax\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

    emit(cg, ".file_append_error:\n");
    emit(cg, "    mov eax, -1\n");
    emit(cg, "    add rsp, 8\n");
    emit(cg, "    pop r13\n");
    emit(cg, "    pop r12\n");
    emit(cg, "    pop rbx\n");
    emit(cg, "    pop rbp\n");
    emit(cg, "    ret\n");

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

    emit(cg, "    mov r12, rdi\n");
    emit(cg, "    mov r13, rsi\n");

    emit(cg, "    cmp r12, 1\n");
    emit(cg, "    jg .args_nonempty\n");
    emit(cg, "    mov rdi, 8\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");
    emit(cg, "    mov QWORD PTR [rbx], 0\n");
    emit(cg, "    mov rax, rbx\n");
    emit(cg, "    jmp .args_done\n");

    emit(cg, ".args_nonempty:\n");
    emit(cg, "    mov rax, r12\n");
    emit(cg, "    imul rax, 8\n");
    emit(cg, "    mov rdi, rax\n");
    emit(cg, "    call malloc@PLT\n");
    emit(cg, "    mov rbx, rax\n");

    emit(cg, "    mov rax, r12\n");
    emit(cg, "    sub rax, 1\n");
    emit(cg, "    mov [rbx], rax\n");

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
