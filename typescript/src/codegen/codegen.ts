/**
 * Main code generation module - translates YAP AST to C code.
 */

import { Program, FnDecl, Stmt, Expr } from '../parser/parser.js';
import {
    parseFixedArrayType,
    parseDynamicArrayType,
    parseSymbolicArrayType,
    typeUsesBase,
} from '../types.js';
import { mapReturnTypeToC, mapTypeToC, mapArrayTypeToC } from './ctype-mapping.js';
import { emitDynamicArrayHelpers } from './dynamic-arrays.js';
import { emitFileIoHelpers } from './file-io.js';
import { genStmt, FnCodegenContext, indent } from './stmt-gen.js';
import { genExpr, isStringExpr } from './expr-gen.js';

// ─── Analysis helpers ─────────────────────────────────────────────────────

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

// ─── Public entry point ───────────────────────────────────────────────────────

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

    // Collect all used dynamic array base types
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

    // Determine which features are needed
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

    // Emit includes
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

    // Emit dynamic array helpers
    for (const baseType of usedDynamicBaseTypes) {
        for (const line of emitDynamicArrayHelpers(baseType)) {
            lines.push(line);
        }
    }

    // Emit file I/O helpers
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

    // Emit function definitions
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

// Test-only export for direct unit testing of internal helpers.
export const __private = {
    isStringExpr,
    genFn,
    indent,
    genStmt,
    mapTypeToC,
    genExpr,
};
