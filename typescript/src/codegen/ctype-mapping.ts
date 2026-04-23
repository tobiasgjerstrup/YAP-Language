/**
 * Maps YAP types to C types and handles type-to-C conversions.
 */

import { parseFixedArrayType, parseDynamicArrayType, parseSymbolicArrayType } from '../types.js';

export function mapTypeToC(varType: string): string {
    const normalized = varType.endsWith('[]') ? varType.slice(0, -2) : varType;
    switch (normalized) {
        case 'int32':
            return 'int32_t';
        case 'int64':
            return 'int64_t';
        case 'string':
            return 'char*';
        case 'boolean':
            return 'bool';
        default:
            throw new Error(`Unsupported variable type: ${varType}`);
    }
}

export function mapReturnTypeToC(returnType: string): string {
    const fixedArray = parseFixedArrayType(returnType);
    if (fixedArray) {
        return `${mapTypeToC(fixedArray.baseType)}*`;
    }
    const dynamicArray = parseDynamicArrayType(returnType);
    if (dynamicArray) {
        return mapArrayTypeToC(dynamicArray);
    }
    const symbolicArray = parseSymbolicArrayType(returnType);
    if (symbolicArray) {
        return mapArrayTypeToC(symbolicArray);
    }
    return mapTypeToC(returnType);
}

export function mapArrayTypeToC(arrayType: { baseType: string }): string {
    // Validate that baseType is supported for dynamic arrays
    mapDynamicArrayCElemType(arrayType.baseType);
    return `yap_array_${arrayType.baseType}`;
}

export function mapDynamicArrayCElemType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t';
        case 'int64': return 'int64_t';
        case 'string': return 'char*';
        case 'boolean': return 'bool';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

export function mapDynamicArrayCElemPtrType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t*';
        case 'int64': return 'int64_t*';
        case 'string': return 'char**';
        case 'boolean': return 'bool*';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

export function mapDynamicArrayCConstInputType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'const int32_t*';
        case 'int64': return 'const int64_t*';
        case 'string': return 'const char**';
        case 'boolean': return 'const bool*';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

export function mapDynamicArrayCompoundLiteralType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t[]';
        case 'int64': return 'int64_t[]';
        case 'string': return 'const char*[]';
        case 'boolean': return 'bool[]';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

export function mapDynamicArrayPopZeroValue(baseType: string): string {
    switch (baseType) {
        case 'int32': return '0';
        case 'int64': return '0';
        case 'string': return 'NULL';
        case 'boolean': return 'false';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}
