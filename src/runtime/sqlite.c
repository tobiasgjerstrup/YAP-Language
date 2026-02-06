#include "runtime/sqlite.h"
#include "runtime/value.h"
#include <sqlite3.h>
#include <stdlib.h>
#include <string.h>

static char* sqlite_strdup(const char *input) {
    if (!input) {
        return NULL;
    }

    size_t len = strlen(input);
    char *out = malloc(len + 1);
    if (!out) {
        return NULL;
    }

    memcpy(out, input, len + 1);
    return out;
}

DbValue* sqlite_open_handle(const char *path, char **error_message) {
    sqlite3 *db = NULL;
    int rc = sqlite3_open(path, &db);
    if (rc != SQLITE_OK) {
        if (error_message) {
            *error_message = sqlite_strdup(db ? sqlite3_errmsg(db) : "sqlite open failed");
        }
        if (db) {
            sqlite3_close(db);
        }
        return NULL;
    }

    DbValue *wrapped = db_create(db);
    if (!wrapped) {
        sqlite3_close(db);
        if (error_message) {
            *error_message = sqlite_strdup("sqlite open: out of memory");
        }
        return NULL;
    }

    return wrapped;
}

int sqlite_close_handle(DbValue *db, char **error_message) {
    if (!db || !db->handle) {
        if (error_message) {
            *error_message = sqlite_strdup("sqlite close on null handle");
        }
        return SQLITE_MISUSE;
    }

    int rc = sqlite3_close(db->handle);
    if (rc != SQLITE_OK) {
        if (error_message) {
            *error_message = sqlite_strdup(sqlite3_errmsg(db->handle));
        }
        return rc;
    }

    db->handle = NULL;
    return SQLITE_OK;
}

int sqlite_exec_sql(DbValue *db, const char *sql, char **error_message) {
    if (!db || !db->handle) {
        if (error_message) {
            *error_message = sqlite_strdup("sqlite exec on null handle");
        }
        return SQLITE_MISUSE;
    }

    char *err = NULL;
    int rc = sqlite3_exec(db->handle, sql, NULL, NULL, &err);
    if (rc != SQLITE_OK) {
        if (error_message) {
            *error_message = sqlite_strdup(err ? err : sqlite3_errmsg(db->handle));
        }
        if (err) {
            sqlite3_free(err);
        }
        return rc;
    }

    return SQLITE_OK;
}

ArrayValue* sqlite_query_sql(DbValue *db, const char *sql, char **error_message) {
    if (!db || !db->handle) {
        if (error_message) {
            *error_message = sqlite_strdup("sqlite query on null handle");
        }
        return NULL;
    }

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2(db->handle, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        if (error_message) {
            *error_message = sqlite_strdup(sqlite3_errmsg(db->handle));
        }
        return NULL;
    }

    int column_count = sqlite3_column_count(stmt);
    ArrayValue *rows = array_create(0);
    if (!rows) {
        sqlite3_finalize(stmt);
        if (error_message) {
            *error_message = sqlite_strdup("sqlite query: out of memory");
        }
        return NULL;
    }

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        ArrayValue *row = array_create(column_count);
        if (!row) {
            array_release(rows);
            sqlite3_finalize(stmt);
            if (error_message) {
                *error_message = sqlite_strdup("sqlite query: out of memory");
            }
            return NULL;
        }

        for (int i = 0; i < column_count; i++) {
            Value cell;
            if (sqlite3_column_type(stmt, i) == SQLITE_NULL) {
                cell = value_create_null();
            } else {
                const unsigned char *text = sqlite3_column_text(stmt, i);
                cell = value_create_string(text ? (const char*)text : "");
            }

            if (!array_ensure_capacity(row, row->length + 1)) {
                value_free(cell);
                array_release(row);
                array_release(rows);
                sqlite3_finalize(stmt);
                if (error_message) {
                    *error_message = sqlite_strdup("sqlite query: out of memory");
                }
                return NULL;
            }

            row->items[row->length++] = cell;
        }

        if (!array_ensure_capacity(rows, rows->length + 1)) {
            array_release(row);
            array_release(rows);
            sqlite3_finalize(stmt);
            if (error_message) {
                *error_message = sqlite_strdup("sqlite query: out of memory");
            }
            return NULL;
        }

        rows->items[rows->length++] = value_create_array(row);
    }

    if (rc != SQLITE_DONE) {
        array_release(rows);
        sqlite3_finalize(stmt);
        if (error_message) {
            *error_message = sqlite_strdup(sqlite3_errmsg(db->handle));
        }
        return NULL;
    }

    sqlite3_finalize(stmt);
    return rows;
}
