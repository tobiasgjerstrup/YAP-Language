/**
 * Expression type inference for the type checker.
 */

import { Expr, ParamDecl } from '../parser/parser.js';
import {
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
            const leftType = inferExprType(expr.left, localScope, fnSigs);
            const rightType = inferExprType(expr.right, localScope, fnSigs);
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
                const argType = inferExprType(expr.args[i], localScope, fnSigs);
                const paramType = sig.params[i].paramType;
                if (!isAssignableType(argType, paramType)) {
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
            const elemType = inferExprType(expr.elements[0], localScope, fnSigs);
            for (let i = 1; i < expr.elements.length; i++) {
                const t = inferExprType(expr.elements[i], localScope, fnSigs);
                if (t !== elemType) {
                    throw new Error(
                        `Array literal has inconsistent element types: '${elemType}' and '${t}'`,
                    );
                }
            }
            return `${elemType}[${expr.elements.length}]`;
        }

        case 'IndexAccess': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
            const arr = parseAnyArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(expr.index, localScope, fnSigs);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            return arr.baseType;
        }

        case 'ArrayLength': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
            const arr = parseAnyArrayType(arrayType);
            if (!arr) {
                throw new Error(`'.length' requires an array type, got '${arrayType}'`);
            }
            return 'int32';
        }

        case 'ArrayPush': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
            const dynamicArr = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            if (!dynamicArr) {
                throw new Error(`'.push' requires a dynamic array type, got '${arrayType}'`);
            }
            const valueType = inferExprType(expr.value, localScope, fnSigs);
            if (valueType !== dynamicArr.baseType) {
                throw new Error(`'.push' expects '${dynamicArr.baseType}', got '${valueType}'`);
            }
            return 'int32';
        }

        case 'ArrayPop': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
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
