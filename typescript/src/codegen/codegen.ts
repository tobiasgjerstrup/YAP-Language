import { Program, FnDecl, Stmt, Expr } from '../parser/parser.js';

interface FixedArrayType {
    baseType: string;
    size: number;
}

interface DynamicArrayType {
    baseType: string;
}

interface SymbolicArrayType {
    baseType: string;
    sizeName: string;
}

type AnyArrayType = FixedArrayType | DynamicArrayType | SymbolicArrayType;

interface FnCodegenContext {
    fnReturnType: string;
    fnReturnArray: (FixedArrayType & { bufferName: string }) | null;
    ownedDynamicArrays: Map<string, string>; // variable name -> base type
}

function parseFixedArrayType(typeName: string): FixedArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (!match) return null;
    return {
        baseType: match[1],
        size: Number(match[2]),
    };
}

function parseDynamicArrayType(typeName: string): DynamicArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[\]$/);
    if (!match) return null;
    return { baseType: match[1] };
}

function parseSymbolicArrayType(typeName: string): SymbolicArrayType | null {
    const match = typeName.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[([a-zA-Z_][a-zA-Z0-9_]*)\]$/);
    if (!match) return null;
    if (/^\d+$/.test(match[2])) {
        return null;
    }
    return { baseType: match[1], sizeName: match[2] };
}

function parseAnyArrayType(typeName: string): AnyArrayType | null {
    return parseFixedArrayType(typeName) ?? parseDynamicArrayType(typeName) ?? parseSymbolicArrayType(typeName);
}

function isDynamicLikeArrayType(typeName: string): boolean {
    return parseDynamicArrayType(typeName) !== null || parseSymbolicArrayType(typeName) !== null;
}

function getBaseType(typeName: string): string {
    const arrayType = parseAnyArrayType(typeName);
    return arrayType ? arrayType.baseType : typeName;
}

function typeUsesBase(typeName: string, baseType: string): boolean {
    return getBaseType(typeName) === baseType;
}

function exprHasBooleanLiteral(expr: Expr): boolean {
    switch (expr.kind) {
        case 'Boolean':
            return true;
        case 'Binary':
            return exprHasBooleanLiteral(expr.left) || exprHasBooleanLiteral(expr.right);
        case 'Call':
            return expr.args.some(exprHasBooleanLiteral);
        case 'ArrayLiteral':
            return expr.elements.some(exprHasBooleanLiteral);
        case 'IndexAccess':
            return exprHasBooleanLiteral(expr.array) || exprHasBooleanLiteral(expr.index);
        case 'ArrayLength':
            return exprHasBooleanLiteral(expr.array);
        case 'ArrayPush':
            return exprHasBooleanLiteral(expr.array) || exprHasBooleanLiteral(expr.value);
        case 'ArrayPop':
            return exprHasBooleanLiteral(expr.array);
        default:
            return false;
    }
}

function stmtHasPrint(stmt: Stmt): boolean {
    switch (stmt.kind) {
        case 'Print':
            return true;
        case 'If':
            return stmt.then.some(stmtHasPrint) || stmt.else_.some(stmtHasPrint);
        case 'While':
            return stmt.body.some(stmtHasPrint);
        default:
            return false;
    }
}

function exprHasCall(expr: Expr, callee: string): boolean {
    switch (expr.kind) {
        case 'Call':
            return expr.callee === callee || expr.args.some((arg) => exprHasCall(arg, callee));
        case 'Binary':
            return exprHasCall(expr.left, callee) || exprHasCall(expr.right, callee);
        case 'ArrayLiteral':
            return expr.elements.some((element) => exprHasCall(element, callee));
        case 'IndexAccess':
            return exprHasCall(expr.array, callee) || exprHasCall(expr.index, callee);
        case 'ArrayLength':
            return exprHasCall(expr.array, callee);
        case 'ArrayPush':
            return exprHasCall(expr.array, callee) || exprHasCall(expr.value, callee);
        case 'ArrayPop':
            return exprHasCall(expr.array, callee);
        default:
            return false;
    }
}

function stmtHasCall(stmt: Stmt, callee: string): boolean {
    switch (stmt.kind) {
        case 'VarDecl':
            return exprHasCall(stmt.init, callee);
        case 'Assign':
            return exprHasCall(stmt.value, callee);
        case 'IndexAssign':
            return (
                exprHasCall(stmt.array, callee) ||
                exprHasCall(stmt.index, callee) ||
                exprHasCall(stmt.value, callee)
            );
        case 'Return':
            return exprHasCall(stmt.value, callee);
        case 'Print':
            return exprHasCall(stmt.arg, callee);
        case 'If':
            return (
                exprHasCall(stmt.cond, callee) ||
                stmt.then.some((nested) => stmtHasCall(nested, callee)) ||
                stmt.else_.some((nested) => stmtHasCall(nested, callee))
            );
        case 'While':
            return exprHasCall(stmt.cond, callee) || stmt.body.some((nested) => stmtHasCall(nested, callee));
        case 'ExprStmt':
            return exprHasCall(stmt.expr, callee);
    }
}

function emitFileIoHelpers(): string[] {
    const lines: string[] = [];
    lines.push('static char* yap_read(const char* path) {');
    lines.push('    FILE* f = fopen(path, "rb");');
    lines.push('    if (!f) return "";');
    lines.push('    if (fseek(f, 0, SEEK_END) != 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    long size = ftell(f);');
    lines.push('    if (size < 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    if (fseek(f, 0, SEEK_SET) != 0) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    char* buffer = (char*)malloc((size_t)size + 1);');
    lines.push('    if (!buffer) {');
    lines.push('        fclose(f);');
    lines.push('        return "";');
    lines.push('    }');
    lines.push('    size_t bytesRead = fread(buffer, 1, (size_t)size, f);');
    lines.push("    buffer[bytesRead] = '\\0';");
    lines.push('    fclose(f);');
    lines.push('    return buffer;');
    lines.push('}');
    lines.push('');
    lines.push('static int32_t yap_write(const char* path, const char* content) {');
    lines.push('    FILE* f = fopen(path, "wb");');
    lines.push('    if (!f) return 1;');
    lines.push('    size_t length = strlen(content);');
    lines.push('    size_t bytesWritten = fwrite(content, 1, length, f);');
    lines.push('    fclose(f);');
    lines.push('    return bytesWritten == length ? 0 : 2;');
    lines.push('}');
    lines.push('');
    return lines;
}

function stmtHasBooleanUsage(stmt: Stmt): boolean {
    switch (stmt.kind) {
        case 'VarDecl':
            return (stmt.varType !== undefined && typeUsesBase(stmt.varType, 'boolean')) || exprHasBooleanLiteral(stmt.init);
        case 'Assign':
            return exprHasBooleanLiteral(stmt.value);
        case 'IndexAssign':
            return exprHasBooleanLiteral(stmt.array) || exprHasBooleanLiteral(stmt.index) || exprHasBooleanLiteral(stmt.value);
        case 'Return':
            return exprHasBooleanLiteral(stmt.value);
        case 'Print':
            return exprHasBooleanLiteral(stmt.arg);
        case 'If':
            return (
                exprHasBooleanLiteral(stmt.cond) ||
                stmt.then.some(stmtHasBooleanUsage) ||
                stmt.else_.some(stmtHasBooleanUsage)
            );
        case 'While':
            return exprHasBooleanLiteral(stmt.cond) || stmt.body.some(stmtHasBooleanUsage);
        case 'ExprStmt':
            return exprHasBooleanLiteral(stmt.expr);
    }
}

function getDynamicArrayCElemType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t';
        case 'int64': return 'int64_t';
        case 'string': return 'char*';
        case 'boolean': return 'bool';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

function getDynamicArrayCElemPtrType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t*';
        case 'int64': return 'int64_t*';
        case 'string': return 'char**';
        case 'boolean': return 'bool*';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

function getDynamicArrayCConstInputType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'const int32_t*';
        case 'int64': return 'const int64_t*';
        case 'string': return 'const char**';
        case 'boolean': return 'const bool*';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

function getDynamicArrayCompoundLiteralType(baseType: string): string {
    switch (baseType) {
        case 'int32': return 'int32_t[]';
        case 'int64': return 'int64_t[]';
        case 'string': return 'const char*[]';
        case 'boolean': return 'bool[]';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

function getDynamicArrayPopZeroValue(baseType: string): string {
    switch (baseType) {
        case 'int32': return '0';
        case 'int64': return '0';
        case 'string': return 'NULL';
        case 'boolean': return 'false';
        default: throw new Error(`Dynamic arrays not supported for type: ${baseType}`);
    }
}

function mapArrayTypeToC(arrayType: DynamicArrayType | SymbolicArrayType): string {
    getDynamicArrayCElemType(arrayType.baseType); // validate
    return `yap_array_${arrayType.baseType}`;
}

function emitDynamicArrayHelpers(baseType: string): string[] {
    const structName = `yap_array_${baseType}`;
    const elemType = getDynamicArrayCElemType(baseType);
    const elemPtrType = getDynamicArrayCElemPtrType(baseType);
    const constInputType = getDynamicArrayCConstInputType(baseType);
    const zeroVal = getDynamicArrayPopZeroValue(baseType);
    const lines: string[] = [];
    lines.push('typedef struct {');
    lines.push(`    ${elemPtrType} data;`);
    lines.push('    int32_t length;');
    lines.push('    int32_t capacity;');
    lines.push(`} ${structName};`);
    lines.push('');
    lines.push(`static ${structName} ${structName}_with_capacity(int32_t capacity) {`);
    lines.push(`    ${structName} arr;`);
    lines.push('    arr.length = 0;');
    lines.push('    arr.capacity = capacity > 0 ? capacity : 1;');
    lines.push(`    arr.data = (${elemPtrType})malloc((size_t)arr.capacity * sizeof(${elemType}));`);
    lines.push('    return arr;');
    lines.push('}');
    lines.push('');
    lines.push(`static ${structName} ${structName}_from_values(${constInputType} values, int32_t length) {`);
    lines.push(`    ${structName} arr = ${structName}_with_capacity(length > 0 ? length : 1);`);
    lines.push('    for (int32_t i = 0; i < length; i++) {');
    lines.push('        arr.data[i] = values[i];');
    lines.push('    }');
    lines.push('    arr.length = length;');
    lines.push('    return arr;');
    lines.push('}');
    lines.push('');
    lines.push(`static void ${structName}_reserve(${structName}* arr, int32_t needed) {`);
    lines.push('    if (arr->capacity >= needed) return;');
    lines.push('    int32_t next = arr->capacity;');
    lines.push('    while (next < needed) next *= 2;');
    lines.push(`    arr->data = (${elemPtrType})realloc(arr->data, (size_t)next * sizeof(${elemType}));`);
    lines.push('    arr->capacity = next;');
    lines.push('}');
    lines.push('');
    lines.push(`static int32_t ${structName}_push(${structName}* arr, ${elemType} value) {`);
    lines.push(`    ${structName}_reserve(arr, arr->length + 1);`);
    lines.push('    arr->data[arr->length++] = value;');
    lines.push('    return arr->length;');
    lines.push('}');
    lines.push('');
    lines.push(`static ${elemType} ${structName}_pop(${structName}* arr) {`);
    lines.push(`    if (arr->length <= 0) return ${zeroVal};`);
    lines.push('    arr->length -= 1;');
    lines.push('    return arr->data[arr->length];');
    lines.push('}');
    lines.push('');
    lines.push(`static void ${structName}_free(${structName}* arr) {`);
    lines.push('    free(arr->data);');
    lines.push('    arr->data = NULL;');
    lines.push('    arr->length = 0;');
    lines.push('    arr->capacity = 0;');
    lines.push('}');
    lines.push('');
    return lines;
}

function mapReturnTypeToC(returnType: string): string {
    const fixedArray = parseFixedArrayType(returnType);
    if (fixedArray) {
        return `${mapTypeToC(fixedArray.baseType)}*`;
    }
    const dynamicArray = parseDynamicArrayType(returnType);
    if (dynamicArray) {
        return mapArrayTypeToC(dynamicArray);
    }
    const symbolicArray = parseSymbolicArrayType(returnType);
    if (symbolicArray) {
        return mapArrayTypeToC(symbolicArray);
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

function getArrayExprType(
    expr: Expr,
    varTypes: Map<string, string>,
    fnReturnTypes: Map<string, string>,
): AnyArrayType | null {
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

function genArrayElementAccess(
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
    const usedDynamicBaseTypes = new Set<string>();
    for (const fn of program.fns) {
        const retDyn = parseDynamicArrayType(fn.returnType) ?? parseSymbolicArrayType(fn.returnType);
        if (retDyn) usedDynamicBaseTypes.add(retDyn.baseType);
        for (const p of fn.params) {
            const paramDyn = parseDynamicArrayType(p.paramType) ?? parseSymbolicArrayType(p.paramType);
            if (paramDyn) usedDynamicBaseTypes.add(paramDyn.baseType);
        }
        for (const stmt of fn.body) {
            if (stmt.kind === 'VarDecl' && (stmt.dynamicArray || stmt.arraySizeName !== undefined) && stmt.varType) {
                usedDynamicBaseTypes.add(stmt.varType);
            }
        }
    }
    const usesAnyDynamicArray = usedDynamicBaseTypes.size > 0;
    const usesPrint = program.fns.some((fn) => fn.body.some(stmtHasPrint));
    const usesRead = program.fns.some((fn) => fn.body.some((stmt) => stmtHasCall(stmt, 'read')));
    const usesWrite = program.fns.some((fn) => fn.body.some((stmt) => stmtHasCall(stmt, 'write')));
    const usesFileIo = usesRead || usesWrite;
    const usesStdint =
        usesFileIo ||
        usesAnyDynamicArray ||
        program.fns.some((fn) => {
            if (typeUsesBase(fn.returnType, 'int32') || typeUsesBase(fn.returnType, 'int64')) {
                return true;
            }
            if (fn.params.some((p) => typeUsesBase(p.paramType, 'int32') || typeUsesBase(p.paramType, 'int64'))) {
                return true;
            }
            return fn.body.some(
                (stmt) =>
                    stmt.kind === 'VarDecl' &&
                    stmt.varType !== undefined &&
                    (typeUsesBase(stmt.varType, 'int32') || typeUsesBase(stmt.varType, 'int64')),
            );
        });
    const usesStdbool =
        program.fns.some((fn) => typeUsesBase(fn.returnType, 'boolean') || fn.params.some((p) => typeUsesBase(p.paramType, 'boolean'))) ||
        program.fns.some((fn) => fn.body.some(stmtHasBooleanUsage));

    if (usesPrint || usesFileIo) {
        lines.push('#include <stdio.h>');
    }
    if (usesStdint) {
        lines.push('#include <stdint.h>');
    }
    if (usesStdbool) {
        lines.push('#include <stdbool.h>');
    }
    if (usesAnyDynamicArray || usesFileIo) {
        lines.push('#include <stdlib.h>');
    }
    if (usesFileIo) {
        lines.push('#include <string.h>');
    }
    lines.push('');

    for (const baseType of usedDynamicBaseTypes) {
        for (const line of emitDynamicArrayHelpers(baseType)) {
            lines.push(line);
        }
    }

    if (usesFileIo) {
        for (const line of emitFileIoHelpers()) {
            lines.push(line);
        }
    }

    // Forward-declare all functions except main
    for (const fn of program.fns) {
        if (fn.name !== 'main') {
            const params = fn.params
                .map((p) => {
                    const fixedArray = parseFixedArrayType(p.paramType);
                    if (fixedArray) {
                        return `${mapTypeToC(fixedArray.baseType)}* ${p.name}`;
                    }
                    const dynArray = parseDynamicArrayType(p.paramType) ?? parseSymbolicArrayType(p.paramType);
                    if (dynArray) {
                        return `${mapArrayTypeToC(dynArray)} ${p.name}`;
                    }
                    return `${mapTypeToC(p.paramType)} ${p.name}`;
                })
                .join(', ') || 'void';
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
    const params = isMain
        ? 'void'
        : fn.params
              .map((p) => {
                  const fixedArray = parseFixedArrayType(p.paramType);
                  if (fixedArray) {
                      return `${mapTypeToC(fixedArray.baseType)}* ${p.name}`;
                  }
                  const dynArray = parseDynamicArrayType(p.paramType) ?? parseSymbolicArrayType(p.paramType);
                  if (dynArray) {
                      return `${mapArrayTypeToC(dynArray)} ${p.name}`;
                  }
                  return `${mapTypeToC(p.paramType)} ${p.name}`;
              })
              .join(', ') || 'void';

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
        ownedDynamicArrays: new Map<string, string>(),
    };

    const prologue = fixedReturnArray
        ? indent(`static ${mapTypeToC(fixedReturnArray.baseType)} ${returnBufferName}[${fixedReturnArray.size}] = {0};`) + '\n'
        : '';
    const body = fn.body.map((s) => indent(genStmt(s, varTypes, fnReturnTypes, ctx))).join('\n');
    const cleanup = Array.from(ctx.ownedDynamicArrays.entries())
        .map(([name, baseType]) => `yap_array_${baseType}_free(&${name});`)
        .join('\n');
    const renderedCleanup = cleanup ? `\n${indent(cleanup)}` : '';
    const footer = isMain ? '\n    return 0;' : '';
    return `${retType} ${fn.name}(${params}) {\n${prologue}${body}${renderedCleanup}${footer}\n}`;
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

            if (stmt.dynamicArray || stmt.arraySizeName !== undefined) {
                const declaredType = stmt.arraySizeName !== undefined ? `${stmt.varType}[${stmt.arraySizeName}]` : `${stmt.varType}[]`;
                varTypes.set(stmt.name, declaredType);
                ctx.ownedDynamicArrays.set(stmt.name, stmt.varType);

                const structName = `yap_array_${stmt.varType}`;
                if (stmt.init.kind === 'ArrayLiteral') {
                    const values = stmt.init.elements.map((element) => genExpr(element, varTypes, fnReturnTypes)).join(', ');
                    const count = stmt.init.elements.length;
                    const compoundType = getDynamicArrayCompoundLiteralType(stmt.varType);
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
        case 'boolean':
            return 'bool';
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

// Test-only export for direct unit testing of internal helpers.
export const __private = {
    isStringExpr,
    genFn,
    indent,
    genStmt,
    mapTypeToC,
    genExpr,
};
