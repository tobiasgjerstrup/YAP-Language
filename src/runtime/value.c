#include "runtime/value.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

ArrayValue* array_create(int capacity) {
    if (capacity < 0) {
        return NULL;
    }

    ArrayValue *arr = malloc(sizeof(ArrayValue));
    if (!arr) {
        return NULL;
    }

    arr->ref_count = 1;
    arr->length = 0;
    arr->capacity = capacity;
    arr->items = NULL;
    if (capacity > 0) {
        arr->items = malloc(sizeof(Value) * capacity);
        if (!arr->items) {
            free(arr);
            return NULL;
        }
    }

    return arr;
}

void array_retain(ArrayValue *arr) {
    if (arr) {
        arr->ref_count += 1;
    }
}

void array_release(ArrayValue *arr) {
    if (!arr) {
        return;
    }

    arr->ref_count -= 1;
    if (arr->ref_count > 0) {
        return;
    }

    for (int i = 0; i < arr->length; i++) {
        value_free(arr->items[i]);
    }

    free(arr->items);
    free(arr);
}

int array_ensure_capacity(ArrayValue *arr, int min_capacity) {
    if (!arr) {
        return 0;
    }

    if (arr->capacity >= min_capacity) {
        return 1;
    }

    int new_capacity = arr->capacity > 0 ? arr->capacity : 4;
    while (new_capacity < min_capacity) {
        new_capacity *= 2;
    }

    Value *new_items = realloc(arr->items, sizeof(Value) * new_capacity);
    if (!new_items) {
        return 0;
    }

    arr->items = new_items;
    arr->capacity = new_capacity;
    return 1;
}

Value value_create_int(int val) {
    Value v;
    v.type = VALUE_INT;
    v.data.int_val = val;
    return v;
}

Value value_create_string(const char *val) {
    Value v;
    v.type = VALUE_STRING;
    v.data.string_val = malloc(strlen(val) + 1);
    strcpy(v.data.string_val, val);
    return v;
}

Value value_create_bool(int val) {
    Value v;
    v.type = VALUE_BOOL;
    v.data.bool_val = val ? 1 : 0;
    return v;
}

Value value_create_null(void) {
    Value v;
    v.type = VALUE_NULL;
    return v;
}

Value value_create_array(ArrayValue *arr) {
    Value v;
    v.type = VALUE_ARRAY;
    v.data.array_val = arr;
    return v;
}

Value value_copy(Value v) {
    if (v.type == VALUE_STRING && v.data.string_val) {
        return value_create_string(v.data.string_val);
    }
    if (v.type == VALUE_ARRAY && v.data.array_val) {
        array_retain(v.data.array_val);
        return v;
    }
    return v;
}

void value_free(Value v) {
    if (v.type == VALUE_STRING && v.data.string_val) {
        free(v.data.string_val);
    }
    if (v.type == VALUE_ARRAY && v.data.array_val) {
        array_release(v.data.array_val);
    }
}

int value_to_int(Value v) {
    switch (v.type) {
        case VALUE_INT: return v.data.int_val;
        case VALUE_BOOL: return v.data.bool_val ? 1 : 0;
        case VALUE_STRING: return atoi(v.data.string_val);
        case VALUE_ARRAY: return v.data.array_val ? v.data.array_val->length : 0;
        case VALUE_NULL: return 0;
    }
    return 0;
}

char* value_to_string(Value v) {
    static char buffer[256];
    switch (v.type) {
        case VALUE_INT:
            sprintf(buffer, "%d", v.data.int_val);
            return buffer;
        case VALUE_BOOL:
            return v.data.bool_val ? "true" : "false";
        case VALUE_STRING:
            return v.data.string_val;
        case VALUE_ARRAY:
            if (v.data.array_val) {
                snprintf(buffer, sizeof(buffer), "array(len=%d)", v.data.array_val->length);
                return buffer;
            }
            return "array(len=0)";
        case VALUE_NULL:
            return "null";
    }
    return "";
}

int value_to_bool(Value v) {
    switch (v.type) {
        case VALUE_INT: return v.data.int_val != 0;
        case VALUE_BOOL: return v.data.bool_val;
        case VALUE_STRING: return strlen(v.data.string_val) > 0;
        case VALUE_ARRAY: return v.data.array_val && v.data.array_val->length > 0;
        case VALUE_NULL: return 0;
    }
    return 0;
}
