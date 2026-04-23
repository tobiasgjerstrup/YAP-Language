/**
 * Statement code generation for translating YAP statements to C.
 */

import { Stmt } from '../parser/parser.js';
import {
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    isDynamicLikeArrayType,
} from '../types.js';
import {
    mapTypeToC,
    mapDynamicArrayCompoundLiteralType,
} from './ctype-mapping.js';
import { genExpr, getFixedArrayExprType, isStringExpr, genArrayElementAccess } from './expr-gen.js';

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
    fnReturnTypes: Map<string, string>,
    ctx: FnCodegenContext,
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
                    const values = stmt.init.elements.map((element) => genExpr(element, varTypes, fnReturnTypes)).join(', ');
                    const count = stmt.init.elements.length;
                    const compoundType = mapDynamicArrayCompoundLiteralType(stmt.varType);
                    return `${structName} ${stmt.name} = ${structName}_from_values((${compoundType}){${values}}, ${count});`;
                }

                return `${structName} ${stmt.name} = ${genExpr(stmt.init, varTypes, fnReturnTypes)};`;
            }

            if (stmt.arraySize !== undefined) {
                varTypes.set(stmt.name, `${stmt.varType}[${stmt.arraySize}]`);
                if (stmt.init.kind === 'ArrayLiteral') {
                    return `${mapTypeToC(stmt.varType)} ${stmt.name}[${stmt.arraySize}] = ${genExpr(stmt.init, varTypes, fnReturnTypes)};`;
                }
                const initArrayType = getFixedArrayExprType(stmt.init, varTypes, fnReturnTypes);
                if (initArrayType) {
                    if (initArrayType.baseType !== stmt.varType) {
                        throw new Error(`Cannot initialize ${stmt.varType}[${stmt.arraySize}] from ${initArrayType.baseType}[${initArrayType.size}]`);
                    }
                    if (initArrayType.size !== stmt.arraySize) {
                        throw new Error(`Cannot initialize ${stmt.varType}[${stmt.arraySize}] from ${initArrayType.baseType}[${initArrayType.size}]`);
                    }
                    const sourceName = `__yap_init_${stmt.name}`;
                    const lines = [
                        `${mapTypeToC(stmt.varType)} ${stmt.name}[${stmt.arraySize}] = {0};`,
                        `${mapTypeToC(stmt.varType)}* ${sourceName} = ${genExpr(stmt.init, varTypes, fnReturnTypes)};`,
                    ];
                    for (let i = 0; i < stmt.arraySize; i++) {
                        lines.push(`${stmt.name}[${i}] = ${sourceName}[${i}];`);
                    }
                    return lines.join('\n');
                }
                return `${mapTypeToC(stmt.varType)} ${stmt.name}[${stmt.arraySize}] = {${genExpr(stmt.init, varTypes, fnReturnTypes)}};`;
            }
            varTypes.set(stmt.name, stmt.varType);
            return `${mapTypeToC(stmt.varType)} ${stmt.name} = ${genExpr(stmt.init, varTypes, fnReturnTypes)};`;
        }

        case 'Assign':
            return `${stmt.name} = ${genExpr(stmt.value, varTypes, fnReturnTypes)};`;

        case 'IndexAssign':
            return `${genArrayElementAccess(stmt.array, stmt.index, varTypes, fnReturnTypes)} = ${genExpr(stmt.value, varTypes, fnReturnTypes)};`;

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
                    lines.push(`${ctx.fnReturnArray.bufferName}[${i}] = ${genExpr(elems[i], varTypes, fnReturnTypes)};`);
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
                    return `${cleanup.join('\n')}\nreturn ${genExpr(stmt.value, varTypes, fnReturnTypes)};`;
                }
            }
            return `return ${genExpr(stmt.value, varTypes, fnReturnTypes)};`;

        case 'Print': {
            const arg = stmt.arg;
            if (isStringExpr(arg, varTypes, fnReturnTypes)) {
                if (arg.kind === 'String') {
                    const escaped = arg.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    return `printf("%s\\n", "${escaped}");`;
                }
                return `printf("%s\\n", ${genExpr(arg, varTypes, fnReturnTypes)});`;
            }
            return `printf("%ld\\n", (long)(${genExpr(arg, varTypes, fnReturnTypes)}));`;
        }

        case 'If': {
            const cond = genExpr(stmt.cond, varTypes, fnReturnTypes);
            const then = stmt.then.map((s) => indent(genStmt(s, varTypes, fnReturnTypes, ctx))).join('\n');
            let out = `if (${cond}) {\n${then}\n}`;
            if (stmt.else_.length > 0) {
                const else_ = stmt.else_.map((s) => indent(genStmt(s, varTypes, fnReturnTypes, ctx))).join('\n');
                out += ` else {\n${else_}\n}`;
            }
            return out;
        }

        case 'While': {
            const cond = genExpr(stmt.cond, varTypes, fnReturnTypes);
            const body = stmt.body.map((s) => indent(genStmt(s, varTypes, fnReturnTypes, ctx))).join('\n');
            return `while (${cond}) {\n${body}\n}`;
        }

        case 'ExprStmt':
            return `${genExpr(stmt.expr, varTypes, fnReturnTypes)};`;
    }
}
