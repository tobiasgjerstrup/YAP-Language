/**
 * Expression type inference for the type checker.
 */

import { Expr, ObjectFieldValue, ParamDecl } from '../parser/parser.js';
import {
    getObjectType,
    ObjectTypeMap,
    parseAnyArrayType,
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    isAssignableType,
    isNumeric,
} from '../types.js';

export interface FnSig {
    params: ParamDecl[];
    returnType: string;
}

export const BUILTIN_FN_SIGS = new Map<string, FnSig>([
    [
        'read',
        {
            params: [{ name: 'path', paramType: 'string' }],
            returnType: 'string',
        },
    ],
    [
        'write',
        {
            params: [
                { name: 'path', paramType: 'string' },
                { name: 'content', paramType: 'string' },
            ],
            returnType: 'int32',
        },
    ],
]);

export function inferExprType(
    expr: Expr,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
    objectTypes: ObjectTypeMap,
): string {
    switch (expr.kind) {
        case 'Number':
            return 'int32';

        case 'String':
            return 'string';

        case 'Ident': {
            const t = localScope.get(expr.name);
            if (t === undefined) {
                throw new Error(`Unknown variable '${expr.name}'`);
            }
            return t;
        }

        case 'Binary': {
            const leftType = inferExprType(expr.left, localScope, fnSigs, objectTypes);
            const rightType = inferExprType(expr.right, localScope, fnSigs, objectTypes);
            const compOps = new Set(['==', '!=', '<', '>', '<=', '>=']);
            if (compOps.has(expr.op)) {
                if (leftType !== rightType) {
                    throw new Error(
                        `Type mismatch in '${expr.op}': left is '${leftType}', right is '${rightType}'`,
                    );
                }
                return 'int32';
            }
            // Arithmetic: +, -, *, /
            if (!isNumeric(leftType)) {
                throw new Error(
                    `Operator '${expr.op}' requires numeric operands, but left operand is '${leftType}'`,
                );
            }
            if (!isNumeric(rightType)) {
                throw new Error(
                    `Operator '${expr.op}' requires numeric operands, but right operand is '${rightType}'`,
                );
            }
            if (leftType !== rightType) {
                throw new Error(
                    `Type mismatch in '${expr.op}': left is '${leftType}', right is '${rightType}'`,
                );
            }
            return leftType;
        }

        case 'Call': {
            const sig = fnSigs.get(expr.callee);
            if (!sig) {
                throw new Error(`Unknown function '${expr.callee}'`);
            }
            if (expr.args.length !== sig.params.length) {
                throw new Error(
                    `Function '${expr.callee}' expects ${sig.params.length} argument(s), got ${expr.args.length}`,
                );
            }
            for (let i = 0; i < expr.args.length; i++) {
                const arg = expr.args[i];
                const paramType = sig.params[i].paramType;
                if (arg.kind === 'ObjectLiteral') {
                    validateExprAgainstType(arg, paramType, localScope, fnSigs, objectTypes);
                    continue;
                }
                const argType = inferExprType(arg, localScope, fnSigs, objectTypes);
                if (!isAssignableType(argType, paramType, objectTypes)) {
                    throw new Error(
                        `Argument ${i + 1} of '${expr.callee}' expects '${paramType}', got '${argType}'`,
                    );
                }
            }
            return sig.returnType;
        }

        case 'ArrayLiteral': {
            if (expr.elements.length === 0) {
                throw new Error('Cannot infer type of empty array literal');
            }
            const elemType = inferExprType(expr.elements[0], localScope, fnSigs, objectTypes);
            for (let i = 1; i < expr.elements.length; i++) {
                const t = inferExprType(expr.elements[i], localScope, fnSigs, objectTypes);
                if (t !== elemType) {
                    throw new Error(
                        `Array literal has inconsistent element types: '${elemType}' and '${t}'`,
                    );
                }
            }
            return `${elemType}[${expr.elements.length}]`;
        }

        case 'ObjectLiteral':
            throw new Error('Cannot infer type of object literal without an explicit target type');

        case 'IndexAccess': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs, objectTypes);
            const arr = parseAnyArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(expr.index, localScope, fnSigs, objectTypes);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            return arr.baseType;
        }

        case 'PropertyAccess': {
            const objectType = inferExprType(expr.object, localScope, fnSigs, objectTypes);
            const objectDecl = getObjectType(objectType, objectTypes);
            if (!objectDecl) {
                throw new Error(`Cannot access property '${expr.property}' on non-object type '${objectType}'`);
            }
            const field = objectDecl.fields.find((candidate) => candidate.name === expr.property);
            if (!field) {
                throw new Error(`Type '${objectType}' has no property '${expr.property}'`);
            }
            return field.fieldType;
        }

        case 'ArrayLength': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs, objectTypes);
            const arr = parseAnyArrayType(arrayType);
            if (!arr) {
                throw new Error(`'.length' requires an array type, got '${arrayType}'`);
            }
            return 'int32';
        }

        case 'ArrayPush': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs, objectTypes);
            const dynamicArr = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            if (!dynamicArr) {
                throw new Error(`'.push' requires a dynamic array type, got '${arrayType}'`);
            }
            if (expr.value.kind === 'ObjectLiteral') {
                validateExprAgainstType(expr.value, dynamicArr.baseType, localScope, fnSigs, objectTypes);
                return 'int32';
            }
            const valueType = inferExprType(expr.value, localScope, fnSigs, objectTypes);
            if (valueType !== dynamicArr.baseType) {
                throw new Error(`'.push' expects '${dynamicArr.baseType}', got '${valueType}'`);
            }
            return 'int32';
        }

        case 'ArrayPop': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs, objectTypes);
            const dynamicArr = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            if (!dynamicArr) {
                throw new Error(`'.pop' requires a dynamic array type, got '${arrayType}'`);
            }
            return dynamicArr.baseType;
        }

        case 'Boolean':
            return 'boolean';
    }
}

function validateObjectLiteralFieldNames(fields: ObjectFieldValue[], targetType: string): void {
    const seen = new Set<string>();
    for (const field of fields) {
        if (seen.has(field.name)) {
            throw new Error(`Object literal for '${targetType}' has duplicate field '${field.name}'`);
        }
        seen.add(field.name);
    }
}

export function validateExprAgainstType(
    expr: Expr,
    targetType: string,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
    objectTypes: ObjectTypeMap,
): void {
    if (expr.kind === 'ObjectLiteral') {
        const objectDecl = getObjectType(targetType, objectTypes);
        if (!objectDecl) {
            throw new Error(`Object literal requires object type, got '${targetType}'`);
        }
        validateObjectLiteralFieldNames(expr.fields, targetType);

        for (const field of expr.fields) {
            if (!objectDecl.fields.some((candidate) => candidate.name === field.name)) {
                throw new Error(`Type '${targetType}' has no field '${field.name}'`);
            }
        }

        for (const expectedField of objectDecl.fields) {
            const providedField = expr.fields.find((field) => field.name === expectedField.name);
            if (!providedField) {
                throw new Error(`Object literal for '${targetType}' is missing field '${expectedField.name}'`);
            }
            validateExprAgainstType(providedField.value, expectedField.fieldType, localScope, fnSigs, objectTypes);
        }
        return;
    }

    if (expr.kind === 'ArrayLiteral') {
        const arrayTarget = parseAnyArrayType(targetType);
        if (!arrayTarget) {
            throw new Error(`Array literal requires array type, got '${targetType}'`);
        }
        const fixedTarget = parseFixedArrayType(targetType);
        if (fixedTarget && expr.elements.length !== fixedTarget.size) {
            throw new Error(
                `Array literal for '${targetType}' expects ${fixedTarget.size} element(s), got ${expr.elements.length}`,
            );
        }
        if (expr.elements.length === 0) {
            if (fixedTarget) {
                throw new Error(`Array literal for '${targetType}' expects ${fixedTarget.size} element(s), got 0`);
            }
            return;
        }
        for (const element of expr.elements) {
            validateExprAgainstType(element, arrayTarget.baseType, localScope, fnSigs, objectTypes);
        }
        return;
    }

    const exprType = inferExprType(expr, localScope, fnSigs, objectTypes);
    if (!isAssignableType(exprType, targetType, objectTypes)) {
        throw new Error(`Expected '${targetType}', got '${exprType}'`);
    }
}
