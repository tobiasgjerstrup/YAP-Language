/**
 * Type parsing and utilities shared across codegen and typecheck modules.
 */

export interface FixedArrayType {
    baseType: string;
    size: number;
}

export interface DynamicArrayType {
    baseType: string;
}

export interface SymbolicArrayType {
    baseType: string;
    sizeName: string;
}

export type AnyArrayType = FixedArrayType | DynamicArrayType | SymbolicArrayType;

export const BASE_TYPES = new Set(['int32', 'int64', 'string', 'boolean']);
export const NUMERIC_TYPES = new Set(['int32', 'int64']);
export const BOOLEAN_TYPES = new Set(['boolean']);

export function parseFixedArrayType(typeName: string): FixedArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (!match) return null;
    return {
        baseType: match[1],
        size: Number(match[2]),
    };
}

export function parseDynamicArrayType(typeName: string): DynamicArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[\]$/);
    if (!match) return null;
    return { baseType: match[1] };
}

export function parseSymbolicArrayType(typeName: string): SymbolicArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
    if (!match) return null;
    if (/^\d+$/.test(match[2])) {
        return null;
    }
    return { baseType: match[1], sizeName: match[2] };
}

export function parseAnyArrayType(typeName: string): AnyArrayType | null {
    return parseFixedArrayType(typeName) ?? parseDynamicArrayType(typeName) ?? parseSymbolicArrayType(typeName);
}

export function getBaseType(typeName: string): string {
    const arrayType = parseAnyArrayType(typeName);
    return arrayType ? arrayType.baseType : typeName;
}

export function typeUsesBase(typeName: string, baseType: string): boolean {
    return getBaseType(typeName) === baseType;
}

export function isNumeric(t: string): boolean {
    return NUMERIC_TYPES.has(t);
}

export function isBoolean(t: string): boolean {
    return BOOLEAN_TYPES.has(t);
}

export function validateTypeName(t: string, context: string): void {
    const arr = parseFixedArrayType(t);
    if (arr) {
        if (!BASE_TYPES.has(arr.baseType)) {
            throw new Error(`Unknown type: ${arr.baseType} (in ${context})`);
        }
        if (arr.size <= 0) {
            throw new Error(`Array size must be positive, got ${arr.size} (in ${context})`);
        }
        return;
    }
    const dynamicArr = parseDynamicArrayType(t);
    if (dynamicArr) {
        if (!BASE_TYPES.has(dynamicArr.baseType)) {
            throw new Error(`Unknown type: ${dynamicArr.baseType} (in ${context})`);
        }
        return;
    }
    const symbolicArr = parseSymbolicArrayType(t);
    if (symbolicArr) {
        if (!BASE_TYPES.has(symbolicArr.baseType)) {
            throw new Error(`Unknown type: ${symbolicArr.baseType} (in ${context})`);
        }
        return;
    }
    if (!BASE_TYPES.has(t)) {
        throw new Error(`Unknown type: ${t} (in ${context})`);
    }
}

export function isAssignableType(sourceType: string, targetType: string): boolean {
    if (sourceType === targetType) {
        return true;
    }

    const sourceArray = parseAnyArrayType(sourceType);
    const targetArray = parseAnyArrayType(targetType);
    if (!sourceArray || !targetArray) {
        return false;
    }

    if (sourceArray.baseType !== targetArray.baseType) {
        return false;
    }

    if (parseFixedArrayType(targetType)) {
        return false;
    }

    return true;
}

export function isDynamicLikeArrayType(typeName: string): boolean {
    return parseDynamicArrayType(typeName) !== null || parseSymbolicArrayType(typeName) !== null;
}
