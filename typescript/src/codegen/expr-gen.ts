/**
 * Expression code generation for translating YAP expressions to C.
 */

import { Expr } from '../parser/parser.js';
import {
    getObjectType,
    ObjectTypeMap,
    parseAnyArrayType,
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    isDynamicLikeArrayType,
} from '../types.js';
import { mapArrayTypeToC, mapDynamicArrayCompoundLiteralType, mapTypeToC } from './ctype-mapping.js';

export interface CodegenFnSig {
    params: string[];
    returnType: string;
}

const EMPTY_OBJECT_TYPES: ObjectTypeMap = new Map();

function getFnReturnType(fnSigs: Map<string, CodegenFnSig | string>, callee: string): string | undefined {
    const sig = fnSigs.get(callee);
    return typeof sig === 'string' ? sig : sig?.returnType;
}

function getFnParamTypes(fnSigs: Map<string, CodegenFnSig | string>, callee: string): string[] | undefined {
    const sig = fnSigs.get(callee);
    return typeof sig === 'string' ? undefined : sig?.params;
}

function genDynamicArrayLiteral(
    baseType: string,
    expr: Extract<Expr, { kind: 'ArrayLiteral' }>,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
): string {
    const compoundType = mapDynamicArrayCompoundLiteralType(baseType);
    const values = expr.elements.map((element) => genExpr(element, varTypes, fnSigs, objectTypes, baseType)).join(', ');
    return `yap_array_${baseType}_from_values((${compoundType}){${values}}, ${expr.elements.length})`;
}

export function genExpr(
    expr: Expr,
    varTypes: Map<string, string> = new Map(),
    fnSigs: Map<string, CodegenFnSig | string> = new Map(),
    objectTypes: ObjectTypeMap = EMPTY_OBJECT_TYPES,
    expectedType?: string,
): string {
    switch (expr.kind) {
        case 'Number':
            return String(expr.value);

        case 'String':
            return `"${expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

        case 'Ident':
            return expr.name;

        case 'Binary':
            return `(${genExpr(expr.left, varTypes, fnSigs, objectTypes)} ${expr.op} ${genExpr(expr.right, varTypes, fnSigs, objectTypes)})`;

        case 'Call': {
            const paramTypes = getFnParamTypes(fnSigs, expr.callee);
            if (expr.callee === 'read' || expr.callee === 'write') {
                return `yap_${expr.callee}(${expr.args.map((arg, index) => genExpr(arg, varTypes, fnSigs, objectTypes, paramTypes?.[index])).join(', ')})`;
            }
            return `${expr.callee}(${expr.args.map((arg, index) => genExpr(arg, varTypes, fnSigs, objectTypes, paramTypes?.[index])).join(', ')})`;
        }

        case 'ArrayLiteral':
            if (expectedType) {
                const dynamicArray = parseDynamicArrayType(expectedType) ?? parseSymbolicArrayType(expectedType);
                if (dynamicArray) {
                    return genDynamicArrayLiteral(dynamicArray.baseType, expr, varTypes, fnSigs, objectTypes);
                }
            }
            return `{${expr.elements.map((element) => genExpr(element, varTypes, fnSigs, objectTypes)).join(', ')}}`;

        case 'ObjectLiteral': {
            if (!expectedType) {
                throw new Error('Object literals require an expected object type during code generation');
            }
            const objectDecl = getObjectType(expectedType, objectTypes);
            if (!objectDecl) {
                throw new Error(`Cannot render object literal for non-object type '${expectedType}'`);
            }
            const fieldInitializers = objectDecl.fields.map((field) => {
                const provided = expr.fields.find((candidate) => candidate.name === field.name);
                if (!provided) {
                    throw new Error(`Missing field '${field.name}' for object literal '${expectedType}'`);
                }
                return `.${field.name} = ${genExpr(provided.value, varTypes, fnSigs, objectTypes, field.fieldType)}`;
            });
            return `(${mapTypeToC(expectedType, objectTypes)}){${fieldInitializers.join(', ')}}`;
        }

        case 'ArrayLength': {
            const arrayType = getArrayExprType(expr.array, varTypes, fnSigs, objectTypes);
            if (!arrayType) {
                throw new Error('Cannot resolve array length for expression');
            }
            if ('size' in arrayType) {
                return String(arrayType.size);
            }
            return `${genExpr(expr.array, varTypes, fnSigs, objectTypes)}.length`;
        }

        case 'IndexAccess':
            return genArrayElementAccess(expr.array, expr.index, varTypes, fnSigs, objectTypes);

        case 'PropertyAccess':
            return `${genExpr(expr.object, varTypes, fnSigs, objectTypes)}.${expr.property}`;

        case 'ArrayPush': {
            const arrayType = getExprType(expr.array, varTypes, fnSigs, objectTypes);
            if (!arrayType || !isDynamicLikeArrayType(arrayType)) {
                throw new Error('push requires a dynamic array variable');
            }
            const dynPush = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            const pushBaseType = dynPush!.baseType;
            return `yap_array_${pushBaseType}_push(&${genExpr(expr.array, varTypes, fnSigs, objectTypes)}, ${genExpr(expr.value, varTypes, fnSigs, objectTypes, pushBaseType)})`;
        }

        case 'ArrayPop': {
            const arrayType = getExprType(expr.array, varTypes, fnSigs, objectTypes);
            if (!arrayType || !isDynamicLikeArrayType(arrayType)) {
                throw new Error('pop requires a dynamic array variable');
            }
            const dynPop = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            const popBaseType = dynPop!.baseType;
            return `yap_array_${popBaseType}_pop(&${genExpr(expr.array, varTypes, fnSigs, objectTypes)})`;
        }

        case 'Boolean': {
            if (expr.value !== true && expr.value !== false) {
                throw new Error('Invalid boolean value');
            }
            return expr.value ? 'true' : 'false';
        }
    }
}

export function getExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
): string | null {
    switch (expr.kind) {
        case 'Ident':
            return varTypes.get(expr.name) ?? null;
        case 'Call':
            return getFnReturnType(fnSigs, expr.callee) ?? null;
        case 'PropertyAccess': {
            const objectType = getExprType(expr.object, varTypes, fnSigs, objectTypes);
            if (!objectType) {
                return null;
            }
            const objectDecl = getObjectType(objectType, objectTypes);
            const field = objectDecl?.fields.find((candidate) => candidate.name === expr.property);
            return field?.fieldType ?? null;
        }
        case 'IndexAccess': {
            const arrayType = getExprType(expr.array, varTypes, fnSigs, objectTypes);
            const parsed = arrayType ? parseAnyArrayType(arrayType) : null;
            return parsed?.baseType ?? null;
        }
        case 'String':
            return 'string';
        case 'Boolean':
            return 'boolean';
        case 'Number':
            return 'int32';
        case 'ArrayLength':
            return 'int32';
        case 'ArrayPop': {
            const arrayType = getExprType(expr.array, varTypes, fnSigs, objectTypes);
            const parsed = arrayType ? parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType) : null;
            return parsed?.baseType ?? null;
        }
        default:
            return null;
    }
}

export function getFixedArrayExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
) {
    const exprType = getExprType(expr, varTypes, fnSigs, objectTypes);
    if (exprType) {
        return parseFixedArrayType(exprType);
    }
    if (expr.kind === 'ArrayLiteral') {
        return {
            baseType: 'int32',
            size: expr.elements.length,
        };
    }
    return null;
}

export function getArrayExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
) {
    const exprType = getExprType(expr, varTypes, fnSigs, objectTypes);
    if (exprType) {
        return parseAnyArrayType(exprType);
    }
    if (expr.kind === 'ArrayLiteral') {
        return {
            baseType: 'int32',
            size: expr.elements.length,
        };
    }
    return null;
}

export function genArrayElementAccess(
    arrayExpr: Expr,
    indexExpr: Expr,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
): string {
    const arrayType = getArrayExprType(arrayExpr, varTypes, fnSigs, objectTypes);
    const renderedArray = genExpr(arrayExpr, varTypes, fnSigs, objectTypes);
    const renderedIndex = genExpr(indexExpr, varTypes, fnSigs, objectTypes);

    if (arrayType) {
        if (!('size' in arrayType)) {
            return `${renderedArray}.data[${renderedIndex}]`;
        }
        if (typeof arrayType.size === 'number') {
            return `${renderedArray}[${renderedIndex}]`;
        }
    }

    const varType = getExprType(arrayExpr, varTypes, fnSigs, objectTypes) ?? undefined;
    if (varType && isDynamicLikeArrayType(varType)) {
        return `${renderedArray}.data[${renderedIndex}]`;
    }

    return `${renderedArray}[${renderedIndex}]`;
}

export function isStringExpr(
    expr: Expr,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    objectTypes: ObjectTypeMap,
): boolean {
    if (expr.kind === 'String') {
        return true;
    }
    return getExprType(expr, varTypes, fnSigs, objectTypes) === 'string';
}
