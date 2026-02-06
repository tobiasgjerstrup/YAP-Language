#include "runtime/io.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char* read_file_contents(const char *path) {
    FILE *file = fopen(path, "r");
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

    rewind(file);

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

int write_file_contents(const char *path, const char *content, const char *mode) {
    FILE *file = fopen(path, mode);
    if (!file) {
        return -1;
    }

    size_t len = strlen(content);
    size_t written = fwrite(content, 1, len, file);
    fclose(file);
    return written == len ? 0 : -1;
}
