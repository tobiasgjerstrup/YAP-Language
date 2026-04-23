/**
 * Statement checking for the type checker.
 */

import { Stmt } from '../parser/parser.js';
import {
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    parseAnyArrayType,
    isAssignableType,
    isNumeric,
    validateTypeName,
} from '../types.js';
import { inferExprType, FnSig } from './type-inference.js';

export function checkStmt(
    stmt: Stmt,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
    fnReturnType: string,
): void {
    switch (stmt.kind) {
        case 'VarDecl': {
            if (stmt.varType === undefined) {
                const initType = inferExprType(stmt.init, localScope, fnSigs);
                if (stmt.arraySize !== undefined || stmt.arraySizeName !== undefined || stmt.dynamicArray) {
                    throw new Error(
                        `Type mismatch in 'let ${stmt.name}': explicit type is required for fixed-size array declarations`,
                    );
                }
                const inferredArrayType = parseFixedArrayType(initType);
                if (inferredArrayType) {
                    stmt.varType = inferredArrayType.baseType;
                    stmt.arraySize = inferredArrayType.size;
                } else {
                    stmt.varType = initType;
                }
                localScope.set(stmt.name, initType);
                break;
            }

            const declaredType = stmt.arraySize !== undefined
                ? `${stmt.varType}[${stmt.arraySize}]`
                : stmt.arraySizeName !== undefined
                  ? `${stmt.varType}[${stmt.arraySizeName}]`
                  : stmt.dynamicArray
                    ? `${stmt.varType}[]`
                    : stmt.varType;
            validateTypeName(declaredType, `let ${stmt.name}`);

            let initType: string;
            if (stmt.init.kind === 'ArrayLiteral' && stmt.init.elements.length === 0) {
                const declaredFixed = parseFixedArrayType(declaredType);
                if (declaredFixed) {
                    initType = `${declaredFixed.baseType}[0]`;
                } else if (parseDynamicArrayType(declaredType) || parseSymbolicArrayType(declaredType)) {
                    initType = declaredType;
                } else {
                    throw new Error('Cannot infer type of empty array literal');
                }
            } else {
                initType = inferExprType(stmt.init, localScope, fnSigs);
            }

            if (stmt.arraySizeName !== undefined) {
                const sizeType = localScope.get(stmt.arraySizeName);
                if (!sizeType) {
                    throw new Error(`Unknown array size variable '${stmt.arraySizeName}' in declaration of '${stmt.name}'`);
                }
                if (!isNumeric(sizeType)) {
                    throw new Error(`Array size variable '${stmt.arraySizeName}' must be numeric, got '${sizeType}'`);
                }
            }

            if (!isAssignableType(initType, declaredType)) {
                throw new Error(
                    `Type mismatch in 'let ${stmt.name}': declared '${declaredType}', initializer is '${initType}'`,
                );
            }
            localScope.set(stmt.name, declaredType);
            break;
        }

        case 'Assign': {
            const varType = localScope.get(stmt.name);
            if (varType === undefined) {
                throw new Error(`Assignment to unknown variable '${stmt.name}'`);
            }
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
            if (!isAssignableType(valueType, varType)) {
                throw new Error(
                    `Type mismatch in assignment to '${stmt.name}': expected '${varType}', got '${valueType}'`,
                );
            }
            break;
        }

        case 'IndexAssign': {
            const arrayType = inferExprType(stmt.array, localScope, fnSigs);
            const arr = parseFixedArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index-assign into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(stmt.index, localScope, fnSigs);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
            if (valueType !== arr.baseType) {
                throw new Error(
                    `Type mismatch in index assignment: array element type is '${arr.baseType}', value is '${valueType}'`,
                );
            }
            break;
        }

        case 'Return': {
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
            if (valueType !== fnReturnType) {
                // A smaller array literal is allowed as the initializer of a larger fixed-size array
                // return buffer (codegen fills only the provided elements). All other mismatches are errors.
                const declaredArr = parseFixedArrayType(fnReturnType);
                const valueArr = parseFixedArrayType(valueType);
                const partialArrayReturn =
                    declaredArr !== null &&
                    valueArr !== null &&
                    declaredArr.baseType === valueArr.baseType &&
                    valueArr.size <= declaredArr.size;
                if (!partialArrayReturn && !isAssignableType(valueType, fnReturnType)) {
                    throw new Error(
                        `Return type mismatch: function declares '${fnReturnType}', returning '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'Print': {
            const argType = inferExprType(stmt.arg, localScope, fnSigs);
            if (parseAnyArrayType(argType)) {
                throw new Error(
                    `Cannot print array type '${argType}' directly; print an element instead`,
                );
            }
            if (!isNumeric(argType) && argType !== 'boolean' && argType !== 'string') {
                throw new Error(`Cannot print value of type '${argType}'`);
            }
            break;
        }

        case 'If': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs);
            if (!isNumeric(condType) && condType !== 'boolean') {
                throw new Error(`'if' condition must be numeric or boolean, got '${condType}'`);
            }
            for (const s of stmt.then) checkStmt(s, localScope, fnSigs, fnReturnType);
            for (const s of stmt.else_) checkStmt(s, localScope, fnSigs, fnReturnType);
            break;
        }

        case 'While': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs);
            if (!isNumeric(condType)) {
                throw new Error(`'while' condition must be numeric, got '${condType}'`);
            }
            for (const s of stmt.body) checkStmt(s, localScope, fnSigs, fnReturnType);
            break;
        }

        case 'ExprStmt':
            inferExprType(stmt.expr, localScope, fnSigs);
            break;
    }
}
