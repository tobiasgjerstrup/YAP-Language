/**
 * Code generation for file I/O helper functions (read/write).
 */

export function emitFileIoHelpers(): string[] {
    const lines: string[] = [];

    lines.push('static char* yap_read(const char* path) {');
    lines.push('    FILE* f = fopen(path, "rb");');
    lines.push('    if (!f) return "";');
    lines.push('    if (fseek(f, 0, SEEK_END) != 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    long size = ftell(f);');
    lines.push('    if (size < 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    if (fseek(f, 0, SEEK_SET) != 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    char* buffer = (char*)malloc((size_t)size + 1);');
    lines.push('    if (!buffer) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    size_t bytesRead = fread(buffer, 1, (size_t)size, f);');
    lines.push("    buffer[bytesRead] = '\\0';");
    lines.push('    fclose(f);');
    lines.push('    return buffer;');
    lines.push('}');
    lines.push('');

    lines.push('static int32_t yap_write(const char* path, const char* content) {');
    lines.push('    FILE* f = fopen(path, "wb");');
    lines.push('    if (!f) return 1;');
    lines.push('    size_t length = strlen(content);');
    lines.push('    size_t bytesWritten = fwrite(content, 1, length, f);');
    lines.push('    fclose(f);');
    lines.push('    return bytesWritten == length ? 0 : 2;');
    lines.push('}');
    lines.push('');

    return lines;
}
