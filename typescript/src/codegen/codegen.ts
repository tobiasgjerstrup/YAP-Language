import { Program, FnDecl, Stmt, Expr } from '../parser/parser.js';

interface FixedArrayType {
    baseType: string;
    size: number;
}

interface FnCodegenContext {
    fnReturnType: string;
    fnReturnArray: (FixedArrayType & { bufferName: string }) | null;
}

function parseFixedArrayType(typeName: string): FixedArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (!match) return null;
    return {
        baseType: match[1],
        size: Number(match[2]),
    };
}

function mapReturnTypeToC(returnType: string): string {
    const fixedArray = parseFixedArrayType(returnType);
    if (fixedArray) {
        return `${mapTypeToC(fixedArray.baseType)}*`;
    }
    return mapTypeToC(returnType);
}

function getFixedArrayExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnReturnTypes: Map<string, string>,
): FixedArrayType | null {
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

/**
 * Infers whether an expression should be printed as a C string.
 *
 * @param expr Expression to inspect.
 * @param varTypes Current function-local variable type table.
 * @param fnReturnTypes Known function return type table.
 * @returns True when expression is string-typed.
 */
function isStringExpr(expr: Expr, varTypes: Map<string, string>, fnReturnTypes: Map<string, string>): boolean {
    if (expr.kind === 'String') return true;
    if (expr.kind === 'Ident') return varTypes.get(expr.name) === 'string';
    if (expr.kind === 'Call') return fnReturnTypes.get(expr.callee) === 'string';
    if (expr.kind === 'IndexAccess' && expr.array.kind === 'Ident') {
        const arrayType = varTypes.get(expr.array.name);
        return arrayType === 'string[]' || Boolean(arrayType?.startsWith('string['));
    }
    return false;
}

/**
 * Generates C source code for a parsed YAP program.
 *
 * Emits includes, forward declarations, and full function definitions.
 *
 * @param program Program AST.
 * @returns Generated C source file contents.
 */
export function generate(program: Program): string {
    const lines: string[] = [];
    const fnReturnTypes = new Map(program.fns.map((f) => [f.name, f.returnType] as const));
    lines.push('#include <stdio.h>');
    lines.push('#include <stdint.h>');
    lines.push('');

    // Forward-declare all functions except main
    for (const fn of program.fns) {
        if (fn.name !== 'main') {
            const params = fn.params.map((p) => `${mapTypeToC(p.paramType)} ${p.name}`).join(', ') || 'void';
            lines.push(`${mapReturnTypeToC(fn.returnType)} ${fn.name}(${params});`);
        }
    }
    if (program.fns.some((f) => f.name !== 'main')) lines.push('');

    for (const fn of program.fns) {
        lines.push(genFn(fn, fnReturnTypes));
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Generates a C function definition from a YAP function node.
 */
function genFn(fn: FnDecl, fnReturnTypes: Map<string, string>): string {
    const isMain = fn.name === 'main';
    const fixedReturnArray = parseFixedArrayType(fn.returnType);
    const retType = isMain ? 'int' : mapReturnTypeToC(fn.returnType);
    const params = isMain ? 'void' : fn.params.map((p) => `${mapTypeToC(p.paramType)} ${p.name}`).join(', ') || 'void';

    const varTypes = new Map<string, string>();
    for (const p of fn.params) {
        varTypes.set(p.name, p.paramType);
    }
    const returnBufferName = `__yap_ret_${fn.name}`;
    const ctx: FnCodegenContext = {
        fnReturnType: fn.returnType,
        fnReturnArray: fixedReturnArray
            ? {
                  ...fixedReturnArray,
                  bufferName: returnBufferName,
              }
            : null,
    };

    const prologue = fixedReturnArray
        ? indent(`static ${mapTypeToC(fixedReturnArray.baseType)} ${returnBufferName}[${fixedReturnArray.size}] = {0};`) + '\n'
        : '';
    const body = fn.body.map((s) => indent(genStmt(s, varTypes, fnReturnTypes, ctx))).join('\n');
    const footer = isMain ? '\n    return 0;' : '';
    return `${retType} ${fn.name}(${params}) {\n${prologue}${body}${footer}\n}`;
}

/**
 * Indents each line of a block by four spaces.
 */
function indent(s: string): string {
    return s
        .split('\n')
        .map((l) => '    ' + l)
        .join('\n');
}

/**
 * Generates C code for a statement node.
 */
function genStmt(stmt: Stmt, varTypes: Map<string, string>, fnReturnTypes: Map<string, string>, ctx: FnCodegenContext): string {
    switch (stmt.kind) {
        case 'VarDecl': {
            if (!stmt.varType) {
                throw new Error(`Unresolved variable type for '${stmt.name}'. Run typecheck before code generation.`);
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
            return `${genExpr(stmt.array, varTypes, fnReturnTypes)}[${genExpr(stmt.index, varTypes, fnReturnTypes)}] = ${genExpr(stmt.value, varTypes, fnReturnTypes)};`;

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

/**
 * Maps language-level types to C types.
 *
 * @throws {Error} If the type is unsupported.
 */
function mapTypeToC(varType: string): string {
    const normalized = varType.endsWith('[]') ? varType.slice(0, -2) : varType;
    switch (normalized) {
        case 'int32':
            return 'int32_t';
        case 'int64':
            return 'int64_t';
        case 'string':
            return 'char*';
        default:
            throw new Error(`Unsupported variable type: ${varType}`);
    }
}

/**
 * Generates C code for an expression node.
 */
function genExpr(expr: Expr, varTypes: Map<string, string> = new Map(), fnReturnTypes: Map<string, string> = new Map()): string {
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
            return `${expr.callee}(${expr.args.map((arg) => genExpr(arg, varTypes, fnReturnTypes)).join(', ')})`;
        case 'ArrayLiteral':
            return `{${expr.elements.map((element) => genExpr(element, varTypes, fnReturnTypes)).join(', ')}}`;
        case 'ArrayLength': {
            const arrayType = getFixedArrayExprType(expr.array, varTypes, fnReturnTypes);
            if (!arrayType) {
                throw new Error('Cannot resolve array length for expression');
            }
            return String(arrayType.size);
        }
        case 'IndexAccess':
            return `${genExpr(expr.array, varTypes, fnReturnTypes)}[${genExpr(expr.index, varTypes, fnReturnTypes)}]`;
    }
}

// Test-only export for direct unit testing of internal helpers.
export const __private = {
    isStringExpr,
    genFn,
    indent,
    genStmt,
    mapTypeToC,
    genExpr,
};
