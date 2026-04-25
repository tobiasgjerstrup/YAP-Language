import type { ObjectTypeDecl } from '../parser/parser.js';
import {
    getBaseType,
    getObjectType,
    isObjectType,
    ObjectTypeMap,
    parseDynamicArrayType,
    parseFixedArrayType,
    parseSymbolicArrayType,
} from '../types.js';
import { mapArrayTypeToC, mapTypeToC } from './ctype-mapping.js';

function emitFieldDeclaration(fieldType: string, fieldName: string, objectTypes: ObjectTypeMap): string {
    const fixedArray = parseFixedArrayType(fieldType);
    if (fixedArray) {
        return `    ${mapTypeToC(fixedArray.baseType, objectTypes)} ${fieldName}[${fixedArray.size}];`;
    }

    const dynamicArray = parseDynamicArrayType(fieldType) ?? parseSymbolicArrayType(fieldType);
    if (dynamicArray) {
        return `    ${mapArrayTypeToC(dynamicArray, objectTypes)} ${fieldName};`;
    }

    return `    ${mapTypeToC(fieldType, objectTypes)} ${fieldName};`;
}

function visitObjectType(
    objectType: ObjectTypeDecl,
    objectTypes: ObjectTypeMap,
    visited: Set<string>,
    visiting: Set<string>,
    ordered: ObjectTypeDecl[],
): void {
    if (visited.has(objectType.name)) {
        return;
    }
    if (visiting.has(objectType.name)) {
        throw new Error(`Circular object type dependency involving '${objectType.name}'`);
    }

    visiting.add(objectType.name);
    for (const field of objectType.fields) {
        const baseType = getBaseType(field.fieldType);
        if (isObjectType(baseType, objectTypes)) {
            const dependency = getObjectType(baseType, objectTypes);
            if (dependency) {
                visitObjectType(dependency, objectTypes, visited, visiting, ordered);
            }
        }
    }
    visiting.delete(objectType.name);
    visited.add(objectType.name);
    ordered.push(objectType);
}

export function emitObjectStructs(objectTypeDecls: ObjectTypeDecl[], objectTypes: ObjectTypeMap): string[] {
    const ordered: ObjectTypeDecl[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    for (const objectType of objectTypeDecls) {
        visitObjectType(objectType, objectTypes, visited, visiting, ordered);
    }

    const lines: string[] = [];
    for (const objectType of ordered) {
        lines.push('typedef struct {');
        for (const field of objectType.fields) {
            lines.push(emitFieldDeclaration(field.fieldType, field.name, objectTypes));
        }
        lines.push(`} ${mapTypeToC(objectType.name, objectTypes)};`);
        lines.push('');
    }
    return lines;
}