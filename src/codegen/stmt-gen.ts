/**
 * Statement code generation for translating YAP statements to C.
 */

import { Stmt } from '../parser/parser.js';
import {
    getObjectType,
    ObjectTypeMap,
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    isDynamicLikeArrayType,
} from '../types.js';
import {
    mapTypeToC,
    mapDynamicArrayCompoundLiteralType,
} from './ctype-mapping.js';
import { CodegenFnSig, genExpr, getExprType, getFixedArrayExprType, isStringExpr, genArrayElementAccess } from './expr-gen.js';

export interface FnCodegenContext {
    fnReturnType: string;
    fnReturnArray: (import('../types.js').FixedArrayType & { bufferName: string }) | null;
    ownedDynamicArrays: Map<string, string>; // variable name -> base type
}

export function indent(s: string): string {
    return s
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n');
}

export function genStmt(
    stmt: Stmt,
    varTypes: Map<string, string>,
    fnSigs: Map<string, CodegenFnSig | string>,
    ctx: FnCodegenContext,
    objectTypes: ObjectTypeMap = new Map(),
): string {
    switch (stmt.kind) {
        case 'VarDecl': {
            if (!stmt.varType) {
                throw new Error(`Unresolved variable type for '${stmt.name}'. Run typecheck before code generation.`);
            }

            if (stmt.dynamicArray || stmt.arraySizeName !== undefined) {
                const declaredType = stmt.arraySizeName !== undefined ? `${stmt.varType}[${stmt.arraySizeName}]` : `${stmt.varType}[]`;
                varTypes.set(stmt.name, declaredType);
                ctx.ownedDynamicArrays.set(stmt.name, stmt.varType);

                const structName = `yap_array_${stmt.varType}`;
                if (stmt.init.kind === 'ArrayLiteral') {
                    const values = stmt.init.elements.map((element) => genExpr(element, varTypes, fnSigs, objectTypes, stmt.varType)).join(', ');
                    const count = stmt.init.elements.length;
                    const compoundType = mapDynamicArrayCompoundLiteralType(stmt.varType);
                    return `${structName} ${stmt.name} = ${structName}_from_values((${compoundType}){${values}}, ${count});`;
                }

                return `${structName} ${stmt.name} = ${genExpr(stmt.init, varTypes, fnSigs, objectTypes, `${stmt.varType}[]`)};`;
            }

            if (stmt.arraySize !== undefined) {
                varTypes.set(stmt.name, `${stmt.varType}[${stmt.arraySize}]`);
                if (stmt.init.kind === 'ArrayLiteral') {
                    return `${mapTypeToC(stmt.varType, objectTypes)} ${stmt.name}[${stmt.arraySize}] = ${genExpr(stmt.init, varTypes, fnSigs, objectTypes, `${stmt.varType}[${stmt.arraySize}]`)};`;
                }
                const initArrayType = getFixedArrayExprType(stmt.init, varTypes, fnSigs, objectTypes);
                if (initArrayType) {
                    if (initArrayType.baseType !== stmt.varType) {
                        throw new Error(`Cannot initialize ${stmt.varType}[${stmt.arraySize}] from ${initArrayType.baseType}[${initArrayType.size}]`);
                    }
                    if (initArrayType.size !== stmt.arraySize) {
                        throw new Error(`Cannot initialize ${stmt.varType}[${stmt.arraySize}] from ${initArrayType.baseType}[${initArrayType.size}]`);
                    }
                    const sourceName = `__yap_init_${stmt.name}`;
                    const lines = [
                        `${mapTypeToC(stmt.varType, objectTypes)} ${stmt.name}[${stmt.arraySize}] = {0};`,
                        `${mapTypeToC(stmt.varType, objectTypes)}* ${sourceName} = ${genExpr(stmt.init, varTypes, fnSigs, objectTypes)};`,
                    ];
                    for (let i = 0; i < stmt.arraySize; i++) {
                        lines.push(`${stmt.name}[${i}] = ${sourceName}[${i}];`);
                    }
                    return lines.join('\n');
                }
                return `${mapTypeToC(stmt.varType, objectTypes)} ${stmt.name}[${stmt.arraySize}] = {${genExpr(stmt.init, varTypes, fnSigs, objectTypes)}};`;
            }
            varTypes.set(stmt.name, stmt.varType);
            return `${mapTypeToC(stmt.varType, objectTypes)} ${stmt.name} = ${genExpr(stmt.init, varTypes, fnSigs, objectTypes, stmt.varType)};`;
        }

        case 'Assign':
            return `${stmt.name} = ${genExpr(stmt.value, varTypes, fnSigs, objectTypes, varTypes.get(stmt.name))};`;

        case 'IndexAssign':
            return `${genArrayElementAccess(stmt.array, stmt.index, varTypes, fnSigs, objectTypes)} = ${genExpr(stmt.value, varTypes, fnSigs, objectTypes)};`;

        case 'PropertyAssign': {
            const objectType = getExprType(stmt.object, varTypes, fnSigs, objectTypes);
            const fieldType = objectType
                ? getObjectType(objectType, objectTypes)?.fields.find((field) => field.name === stmt.property)?.fieldType
                : undefined;
            return `${genExpr(stmt.object, varTypes, fnSigs, objectTypes)}.${stmt.property} = ${genExpr(stmt.value, varTypes, fnSigs, objectTypes, fieldType)};`;
        }

        case 'Return':
            if (ctx.fnReturnArray && stmt.value.kind === 'ArrayLiteral') {
                const elems = stmt.value.elements;
                if (elems.length > ctx.fnReturnArray.size) {
                    throw new Error(
                        `Array return literal too large: ${elems.length} > ${ctx.fnReturnArray.size} for ${ctx.fnReturnType}`,
                    );
                }
                const lines: string[] = [];
                for (let i = 0; i < elems.length; i++) {
                    lines.push(`${ctx.fnReturnArray.bufferName}[${i}] = ${genExpr(elems[i], varTypes, fnSigs, objectTypes)};`);
                }
                lines.push(`return ${ctx.fnReturnArray.bufferName};`);
                return lines.join('\n');
            }
            if (ctx.ownedDynamicArrays.size > 0) {
                const returnedLocal = stmt.value.kind === 'Ident' ? stmt.value.name : null;
                const cleanup = Array.from(ctx.ownedDynamicArrays.entries())
                    .filter(([name]) => name !== returnedLocal)
                    .map(([name, baseType]) => `yap_array_${baseType}_free(&${name});`);
                if (cleanup.length > 0) {
                    return `${cleanup.join('\n')}\nreturn ${genExpr(stmt.value, varTypes, fnSigs, objectTypes, ctx.fnReturnType)};`;
                }
            }
            return `return ${genExpr(stmt.value, varTypes, fnSigs, objectTypes, ctx.fnReturnType)};`;

        case 'Print': {
            const arg = stmt.arg;
            if (isStringExpr(arg, varTypes, fnSigs, objectTypes)) {
                if (arg.kind === 'String') {
                    const escaped = arg.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return `printf("%s\\n", "${escaped}");`;
                }
                return `printf("%s\\n", ${genExpr(arg, varTypes, fnSigs, objectTypes)});`;
            }
            return `printf("%ld\\n", (long)(${genExpr(arg, varTypes, fnSigs, objectTypes)}));`;
        }

        case 'If': {
            const cond = genExpr(stmt.cond, varTypes, fnSigs, objectTypes);
            const then = stmt.then.map((s) => indent(genStmt(s, varTypes, fnSigs, ctx, objectTypes))).join('\n');
            let out = `if (${cond}) {\n${then}\n}`;
            if (stmt.else_.length > 0) {
                const else_ = stmt.else_.map((s) => indent(genStmt(s, varTypes, fnSigs, ctx, objectTypes))).join('\n');
                out += ` else {\n${else_}\n}`;
            }
            return out;
        }

        case 'While': {
            const cond = genExpr(stmt.cond, varTypes, fnSigs, objectTypes);
            const body = stmt.body.map((s) => indent(genStmt(s, varTypes, fnSigs, ctx, objectTypes))).join('\n');
            return `while (${cond}) {\n${body}\n}`;
        }

        case 'ExprStmt':
            return `${genExpr(stmt.expr, varTypes, fnSigs, objectTypes)};`;
    }
}
