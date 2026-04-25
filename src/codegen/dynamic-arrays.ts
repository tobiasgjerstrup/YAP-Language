/**
 * Code generation for dynamic array helper functions and types.
 */

import {
    mapDynamicArrayCElemType,
    mapDynamicArrayCElemPtrType,
    mapDynamicArrayCConstInputType,
    mapDynamicArrayPopZeroValue,
} from './ctype-mapping.js';

export function emitDynamicArrayHelpers(baseType: string): string[] {
    const structName = `yap_array_${baseType}`;
    const elemType = mapDynamicArrayCElemType(baseType);
    const elemPtrType = mapDynamicArrayCElemPtrType(baseType);
    const constInputType = mapDynamicArrayCConstInputType(baseType);
    const zeroVal = mapDynamicArrayPopZeroValue(baseType);
    const lines: string[] = [];

    lines.push('typedef struct {');
    lines.push(`    ${elemPtrType} data;`);
    lines.push('    int32_t length;');
    lines.push('    int32_t capacity;');
    lines.push(`} ${structName};`);
    lines.push('');

    lines.push(`static ${structName} ${structName}_with_capacity(int32_t capacity) {`);
    lines.push(`    ${structName} arr;`);
    lines.push('    arr.length = 0;');
    lines.push('    arr.capacity = capacity > 0 ? capacity : 1;');
    lines.push(`    arr.data = (${elemPtrType})malloc((size_t)arr.capacity * sizeof(${elemType}));`);
    lines.push('    return arr;');
    lines.push('}');
    lines.push('');

    lines.push(`static ${structName} ${structName}_from_values(${constInputType} values, int32_t length) {`);
    lines.push(`    ${structName} arr = ${structName}_with_capacity(length > 0 ? length : 1);`);
    lines.push('    for (int32_t i = 0; i < length; i++) {');
    lines.push('        arr.data[i] = values[i];');
    lines.push('    }');
    lines.push('    arr.length = length;');
    lines.push('    return arr;');
    lines.push('}');
    lines.push('');

    lines.push(`static void ${structName}_reserve(${structName}* arr, int32_t needed) {`);
    lines.push('    if (arr->capacity >= needed) return;');
    lines.push('    int32_t next = arr->capacity;');
    lines.push('    while (next < needed) next *= 2;');
    lines.push(`    arr->data = (${elemPtrType})realloc(arr->data, (size_t)next * sizeof(${elemType}));`);
    lines.push('    arr->capacity = next;');
    lines.push('}');
    lines.push('');

    lines.push(`static int32_t ${structName}_push(${structName}* arr, ${elemType} value) {`);
    lines.push(`    ${structName}_reserve(arr, arr->length + 1);`);
    lines.push('    arr->data[arr->length++] = value;');
    lines.push('    return arr->length;');
    lines.push('}');
    lines.push('');

    lines.push(`static ${elemType} ${structName}_pop(${structName}* arr) {`);
    lines.push(`    if (arr->length <= 0) return ${zeroVal};`);
    lines.push('    arr->length -= 1;');
    lines.push('    return arr->data[arr->length];');
    lines.push('}');
    lines.push('');

    lines.push(`static void ${structName}_free(${structName}* arr) {`);
    lines.push('    free(arr->data);');
    lines.push('    arr->data = NULL;');
    lines.push('    arr->length = 0;');
    lines.push('    arr->capacity = 0;');
    lines.push('}');
    lines.push('');

    return lines;
}
