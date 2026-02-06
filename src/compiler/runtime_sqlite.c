#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern long* yap_array_push(long *arr, long value);

#if defined(__GNUC__) && defined(__x86_64__)
#define YAP_FORCE_ALIGN __attribute__((force_align_arg_pointer))
#else
#define YAP_FORCE_ALIGN
#endif

static long* yap_array_create_empty(void) {
    long *arr = (long*)malloc(sizeof(long));
    if (!arr) {
        return NULL;
    }
    arr[0] = 0;
    return arr;
}

static char* yap_strdup(const char *input) {
    if (!input) {
        return NULL;
    }

    size_t len = strlen(input);
    char *out = (char*)malloc(len + 1);
    if (!out) {
        return NULL;
    }

    memcpy(out, input, len + 1);
    return out;
}

YAP_FORCE_ALIGN void* yap_sqlite_open(const char *path) {
    if (!path) {
        return NULL;
    }

    const char *debug = getenv("YAP_SQLITE_DEBUG");
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_open path=%p\n", (void*)path);
        fflush(stderr);
    }

    sqlite3 *db = NULL;
    int rc = sqlite3_open(path, &db);
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_open rc=%d\n", rc);
        fflush(stderr);
    }
    if (rc != SQLITE_OK) {
        if (db) {
            sqlite3_close(db);
        }
        return NULL;
    }

    return db;
}

YAP_FORCE_ALIGN long yap_sqlite_close(void *handle) {
    if (!handle) {
        return SQLITE_MISUSE;
    }

    return sqlite3_close((sqlite3*)handle);
}

YAP_FORCE_ALIGN long yap_sqlite_exec(void *handle, const char *sql) {
    const char *debug = getenv("YAP_SQLITE_DEBUG");
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_exec handle=%p sql=%p\n", handle, (void*)sql);
        fflush(stderr);
    }
    if (!handle || !sql) {
        return SQLITE_MISUSE;
    }

    char *err = NULL;
    int rc = sqlite3_exec((sqlite3*)handle, sql, NULL, NULL, &err);
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_exec rc=%d\n", rc);
        fflush(stderr);
    }
    if (err) {
        sqlite3_free(err);
    }
    return rc;
}

YAP_FORCE_ALIGN long* yap_sqlite_query(void *handle, const char *sql) {
    const char *debug = getenv("YAP_SQLITE_DEBUG");
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_query handle=%p sql=%p\n", handle, (void*)sql);
        fflush(stderr);
    }
    if (!handle || !sql) {
        return NULL;
    }

    sqlite3_stmt *stmt = NULL;
    int rc = sqlite3_prepare_v2((sqlite3*)handle, sql, -1, &stmt, NULL);
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_query prepare rc=%d\n", rc);
        fflush(stderr);
    }
    if (rc != SQLITE_OK) {
        return NULL;
    }

    long *rows = yap_array_create_empty();
    if (!rows) {
        sqlite3_finalize(stmt);
        return NULL;
    }

    int column_count = sqlite3_column_count(stmt);
    int row_index = 0;
    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        if (debug && debug[0] != '\0' && row_index < 3) {
            fprintf(stderr, "yap_sqlite_query step row=%d\n", row_index);
            fflush(stderr);
        }
        long *row = yap_array_create_empty();
        if (!row) {
            sqlite3_finalize(stmt);
            return NULL;
        }

        for (int i = 0; i < column_count; i++) {
            const unsigned char *text = sqlite3_column_text(stmt, i);
            char *cell = text ? yap_strdup((const char*)text) : NULL;
            row = yap_array_push(row, (long)cell);
            if (!row) {
                sqlite3_finalize(stmt);
                return NULL;
            }
        }

        rows = yap_array_push(rows, (long)row);
        if (!rows) {
            sqlite3_finalize(stmt);
            return NULL;
        }
        row_index += 1;
    }

    sqlite3_finalize(stmt);
    if (debug && debug[0] != '\0') {
        fprintf(stderr, "yap_sqlite_query done rc=%d rows=%d\n", rc, row_index);
        fflush(stderr);
    }
    if (rc != SQLITE_DONE) {
        return NULL;
    }

    return rows;
}
