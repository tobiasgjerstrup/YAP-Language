#ifndef VALUE_H
#define VALUE_H

typedef enum {
    VALUE_INT,
    VALUE_STRING,
    VALUE_BOOL,
    VALUE_NULL,
    VALUE_ARRAY
} ValueType;

typedef struct ArrayValue ArrayValue;

typedef struct {
    ValueType type;
    union {
        int int_val;
        char *string_val;
        int bool_val;
        ArrayValue *array_val;
    } data;
} Value;

struct ArrayValue {
    int ref_count;
    int length;
    int capacity;
    Value *items;
};

Value value_create_int(int val);
Value value_create_string(const char *val);
Value value_create_bool(int val);
Value value_create_null(void);
Value value_create_array(ArrayValue *arr);
Value value_copy(Value v);
void value_free(Value v);
int value_to_int(Value v);
char* value_to_string(Value v);
int value_to_bool(Value v);

ArrayValue* array_create(int capacity);
void array_retain(ArrayValue *arr);
void array_release(ArrayValue *arr);
int array_ensure_capacity(ArrayValue *arr, int min_capacity);

#endif // VALUE_H
