#ifndef RUNTIME_SQLITE_H
#define RUNTIME_SQLITE_H

#include "runtime/value.h"

DbValue* sqlite_open_handle(const char *path, char **error_message);
int sqlite_close_handle(DbValue *db, char **error_message);
int sqlite_exec_sql(DbValue *db, const char *sql, char **error_message);
ArrayValue* sqlite_query_sql(DbValue *db, const char *sql, char **error_message);

#endif // RUNTIME_SQLITE_H
