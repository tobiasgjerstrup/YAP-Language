/**
 * Statement checking for the type checker.
 */

import { Stmt } from '../parser/parser.js';
import {
    getObjectType,
    ObjectTypeMap,
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    parseAnyArrayType,
    isAssignableType,
    isNumeric,
    validateTypeName,
} from '../types.js';
import { inferExprType, FnSig, validateExprAgainstType } from './type-inference.js';

export function checkStmt(
    stmt: Stmt,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
    fnReturnType: string,
    objectTypes: ObjectTypeMap,
): void {
    switch (stmt.kind) {
        case 'VarDecl': {
            if (stmt.varType === undefined) {
                if (stmt.init.kind === 'ObjectLiteral') {
                    throw new Error(`Cannot infer type of object literal in 'let ${stmt.name}'; add an explicit type`);
                }
                const initType = inferExprType(stmt.init, localScope, fnSigs, objectTypes);
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
            validateTypeName(declaredType, `let ${stmt.name}`, objectTypes);

            if (stmt.arraySizeName !== undefined) {
                const sizeType = localScope.get(stmt.arraySizeName);
                if (!sizeType) {
                    throw new Error(`Unknown array size variable '${stmt.arraySizeName}' in declaration of '${stmt.name}'`);
                }
                if (!isNumeric(sizeType)) {
                    throw new Error(`Array size variable '${stmt.arraySizeName}' must be numeric, got '${sizeType}'`);
                }
            }

            if (stmt.init.kind === 'ObjectLiteral') {
                try {
                    validateExprAgainstType(stmt.init, declaredType, localScope, fnSigs, objectTypes);
                } catch (error) {
                    throw new Error(
                        `Type mismatch in 'let ${stmt.name}': declared '${declaredType}', ${(error as Error).message.toLowerCase()}`,
                    );
                }
            } else {
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
                    initType = inferExprType(stmt.init, localScope, fnSigs, objectTypes);
                }

                if (!isAssignableType(initType, declaredType, objectTypes)) {
                    throw new Error(
                        `Type mismatch in 'let ${stmt.name}': declared '${declaredType}', initializer is '${initType}'`,
                    );
                }
            }
            localScope.set(stmt.name, declaredType);
            break;
        }

        case 'Assign': {
            const varType = localScope.get(stmt.name);
            if (varType === undefined) {
                throw new Error(`Assignment to unknown variable '${stmt.name}'`);
            }
            if (stmt.value.kind === 'ObjectLiteral') {
                validateExprAgainstType(stmt.value, varType, localScope, fnSigs, objectTypes);
            } else {
                const valueType = inferExprType(stmt.value, localScope, fnSigs, objectTypes);
                if (!isAssignableType(valueType, varType, objectTypes)) {
                    throw new Error(
                        `Type mismatch in assignment to '${stmt.name}': expected '${varType}', got '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'IndexAssign': {
            const arrayType = inferExprType(stmt.array, localScope, fnSigs, objectTypes);
            const arr = parseFixedArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index-assign into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(stmt.index, localScope, fnSigs, objectTypes);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            if (stmt.value.kind === 'ObjectLiteral') {
                validateExprAgainstType(stmt.value, arr.baseType, localScope, fnSigs, objectTypes);
            } else {
                const valueType = inferExprType(stmt.value, localScope, fnSigs, objectTypes);
                if (valueType !== arr.baseType) {
                    throw new Error(
                        `Type mismatch in index assignment: array element type is '${arr.baseType}', value is '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'PropertyAssign': {
            const objectType = inferExprType(stmt.object, localScope, fnSigs, objectTypes);
            const objectDecl = getObjectType(objectType, objectTypes);
            if (!objectDecl) {
                throw new Error(`Cannot assign property '${stmt.property}' on non-object type '${objectType}'`);
            }
            const field = objectDecl.fields.find((candidate) => candidate.name === stmt.property);
            if (!field) {
                throw new Error(`Type '${objectType}' has no property '${stmt.property}'`);
            }
            if (stmt.value.kind === 'ObjectLiteral') {
                validateExprAgainstType(stmt.value, field.fieldType, localScope, fnSigs, objectTypes);
            } else {
                const valueType = inferExprType(stmt.value, localScope, fnSigs, objectTypes);
                if (!isAssignableType(valueType, field.fieldType, objectTypes)) {
                    throw new Error(
                        `Type mismatch in property assignment to '${stmt.property}': expected '${field.fieldType}', got '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'Return': {
            if (stmt.value.kind === 'ObjectLiteral') {
                validateExprAgainstType(stmt.value, fnReturnType, localScope, fnSigs, objectTypes);
                break;
            }
            const valueType = inferExprType(stmt.value, localScope, fnSigs, objectTypes);
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
                if (!partialArrayReturn && !isAssignableType(valueType, fnReturnType, objectTypes)) {
                    throw new Error(
                        `Return type mismatch: function declares '${fnReturnType}', returning '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'Print': {
            const argType = inferExprType(stmt.arg, localScope, fnSigs, objectTypes);
            if (parseAnyArrayType(argType)) {
                throw new Error(
                    `Cannot print array type '${argType}' directly; print an element instead`,
                );
            }
            if (getObjectType(argType, objectTypes)) {
                throw new Error(`Cannot print value of type '${argType}'`);
            }
            if (!isNumeric(argType) && argType !== 'boolean' && argType !== 'string') {
                throw new Error(`Cannot print value of type '${argType}'`);
            }
            break;
        }

        case 'If': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs, objectTypes);
            if (!isNumeric(condType) && condType !== 'boolean') {
                throw new Error(`'if' condition must be numeric or boolean, got '${condType}'`);
            }
            for (const s of stmt.then) checkStmt(s, localScope, fnSigs, fnReturnType, objectTypes);
            for (const s of stmt.else_) checkStmt(s, localScope, fnSigs, fnReturnType, objectTypes);
            break;
        }

        case 'While': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs, objectTypes);
            if (!isNumeric(condType)) {
                throw new Error(`'while' condition must be numeric, got '${condType}'`);
            }
            for (const s of stmt.body) checkStmt(s, localScope, fnSigs, fnReturnType, objectTypes);
            break;
        }

        case 'ExprStmt':
            inferExprType(stmt.expr, localScope, fnSigs, objectTypes);
            break;
    }
}
