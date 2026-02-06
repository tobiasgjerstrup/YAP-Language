#ifndef RUNTIME_IO_H
#define RUNTIME_IO_H

char* read_file_contents(const char *path);
int write_file_contents(const char *path, const char *content, const char *mode);

#endif // RUNTIME_IO_H
