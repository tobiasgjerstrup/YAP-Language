/**
 * Main type checker module - validates type correctness of a YAP program.
 */

import { Program, FnDecl } from '../parser/parser.js';
import { validateTypeName } from '../types.js';
import { BUILTIN_FN_SIGS, FnSig } from './type-inference.js';
import { checkStmt } from './stmt-check.js';

/**
 * Type-checks a complete program.
 *
 * Validates all function signatures and statement types, populating inferred types
 * in VarDecl statements.
 *
 * @param program Program AST to type-check.
 * @throws {Error} If any type errors are found.
 */
export function typecheckProgram(program: Program): void {
    const fnSigs = new Map<string, FnSig>(BUILTIN_FN_SIGS);

    // Build function signature map
    for (const fn of program.fns) {
        fnSigs.set(fn.name, { params: fn.params, returnType: fn.returnType });
    }

    // Check each function
    for (const fn of program.fns) {
        checkFn(fn, fnSigs);
    }
}

function checkFn(fn: FnDecl, fnSigs: Map<string, FnSig>): void {
    validateTypeName(fn.returnType, `fn ${fn.name} return type`);
    for (const p of fn.params) {
        validateTypeName(p.paramType, `fn ${fn.name} param '${p.name}'`);
    }

    const localScope = new Map<string, string>();
    for (const p of fn.params) {
        localScope.set(p.name, p.paramType);
    }

    for (const stmt of fn.body) {
        checkStmt(stmt, localScope, fnSigs, fn.returnType);
    }
}
