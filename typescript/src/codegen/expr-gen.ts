/**
 * Expression code generation for translating YAP expressions to C.
 */

import { Expr } from '../parser/parser.js';
import { parseAnyArrayType, parseFixedArrayType, parseDynamicArrayType, parseSymbolicArrayType, isDynamicLikeArrayType } from '../types.js';
import { mapArrayTypeToC } from './ctype-mapping.js';

export function genExpr(expr: Expr, varTypes: Map<string, string> = new Map(), fnReturnTypes: Map<string, string> = new Map()): string {
    switch (expr.kind) {
        case 'Number':
            return String(expr.value);

        case 'String':
            return `"${expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

        case 'Ident':
            return expr.name;

        case 'Binary':
            return `(${genExpr(expr.left, varTypes, fnReturnTypes)} ${expr.op} ${genExpr(expr.right, varTypes, fnReturnTypes)})`;

        case 'Call':
            if (expr.callee === 'read' || expr.callee === 'write') {
                return `yap_${expr.callee}(${expr.args.map((arg) => genExpr(arg, varTypes, fnReturnTypes)).join(', ')})`;
            }
            return `${expr.callee}(${expr.args.map((arg) => genExpr(arg, varTypes, fnReturnTypes)).join(', ')})`;

        case 'ArrayLiteral':
            return `{${expr.elements.map((element) => genExpr(element, varTypes, fnReturnTypes)).join(', ')}}`;

        case 'ArrayLength': {
            const arrayType = getArrayExprType(expr.array, varTypes, fnReturnTypes);
            if (!arrayType) {
                throw new Error('Cannot resolve array length for expression');
            }
            if ('size' in arrayType) {
                return String(arrayType.size);
            }
            return `${genExpr(expr.array, varTypes, fnReturnTypes)}.length`;
        }

        case 'IndexAccess':
            return genArrayElementAccess(expr.array, expr.index, varTypes, fnReturnTypes);

        case 'ArrayPush': {
            if (expr.array.kind !== 'Ident') {
                throw new Error('push currently requires an array variable');
            }
            const arrayType = varTypes.get(expr.array.name);
            if (!arrayType || !isDynamicLikeArrayType(arrayType)) {
                throw new Error('push requires a dynamic array variable');
            }
            const dynPush = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            const pushBaseType = dynPush!.baseType;
            return `yap_array_${pushBaseType}_push(&${expr.array.name}, ${genExpr(expr.value, varTypes, fnReturnTypes)})`;
        }

        case 'ArrayPop': {
            if (expr.array.kind !== 'Ident') {
                throw new Error('pop currently requires an array variable');
            }
            const arrayType = varTypes.get(expr.array.name);
            if (!arrayType || !isDynamicLikeArrayType(arrayType)) {
                throw new Error('pop requires a dynamic array variable');
            }
            const dynPop = parseDynamicArrayType(arrayType) ?? parseSymbolicArrayType(arrayType);
            const popBaseType = dynPop!.baseType;
            return `yap_array_${popBaseType}_pop(&${expr.array.name})`;
        }

        case 'Boolean': {
            if (expr.value !== true && expr.value !== false) {
                throw new Error('Invalid boolean value');
            }
            return expr.value ? 'true' : 'false';
        }
    }
}

export function getFixedArrayExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnReturnTypes: Map<string, string>,
) {
    if (expr.kind === 'Call') {
        const returnType = fnReturnTypes.get(expr.callee);
        return returnType ? parseFixedArrayType(returnType) : null;
    }
    if (expr.kind === 'Ident') {
        const varType = varTypes.get(expr.name);
        return varType ? parseFixedArrayType(varType) : null;
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
    fnReturnTypes: Map<string, string>,
) {
    if (expr.kind === 'Call') {
        const returnType = fnReturnTypes.get(expr.callee);
        return returnType ? parseAnyArrayType(returnType) : null;
    }
    if (expr.kind === 'Ident') {
        const varType = varTypes.get(expr.name);
        return varType ? parseAnyArrayType(varType) : null;
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
    fnReturnTypes: Map<string, string>,
): string {
    const arrayType = getArrayExprType(arrayExpr, varTypes, fnReturnTypes);
    const renderedArray = genExpr(arrayExpr, varTypes, fnReturnTypes);
    const renderedIndex = genExpr(indexExpr, varTypes, fnReturnTypes);

    if (arrayType) {
        if (!('size' in arrayType)) {
            return `${renderedArray}.data[${renderedIndex}]`;
        }
        if (typeof arrayType.size === 'number') {
            return `${renderedArray}[${renderedIndex}]`;
        }
    }

    const varType = arrayExpr.kind === 'Ident' ? varTypes.get(arrayExpr.name) : undefined;
    if (varType && isDynamicLikeArrayType(varType)) {
        return `${renderedArray}.data[${renderedIndex}]`;
    }

    return `${renderedArray}[${renderedIndex}]`;
}

export function isStringExpr(expr: Expr, varTypes: Map<string, string>, fnReturnTypes: Map<string, string>): boolean {
    if (expr.kind === 'String') return true;
    if (expr.kind === 'Ident') return varTypes.get(expr.name) === 'string';
    if (expr.kind === 'Call') return fnReturnTypes.get(expr.callee) === 'string';
    if (expr.kind === 'IndexAccess' && expr.array.kind === 'Ident') {
        const arrayType = varTypes.get(expr.array.name);
        return arrayType === 'string[]' || Boolean(arrayType?.startsWith('string['));
    }
    return false;
}
