/**
 * Main type checker module - validates type correctness of a YAP program.
 */

import { Program, FnDecl } from '../parser/parser.js';
import { buildObjectTypeMap, validateTypeName } from '../types.js';
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
    const objectTypes = buildObjectTypeMap(program.objectTypes ?? []);

    for (const objectType of program.objectTypes ?? []) {
        if (objectType.fields.length === 0) {
            throw new Error(`Object type '${objectType.name}' must declare at least one field`);
        }
        const seenFields = new Set<string>();
        for (const field of objectType.fields) {
            if (seenFields.has(field.name)) {
                throw new Error(`Object type '${objectType.name}' has duplicate field '${field.name}'`);
            }
            seenFields.add(field.name);
            validateTypeName(field.fieldType, `type ${objectType.name} field '${field.name}'`, objectTypes);
        }
    }

    // Build function signature map
    for (const fn of program.fns) {
        fnSigs.set(fn.name, { params: fn.params, returnType: fn.returnType });
    }

    // Check each function
    for (const fn of program.fns) {
        checkFn(fn, fnSigs, objectTypes);
    }
}

function checkFn(fn: FnDecl, fnSigs: Map<string, FnSig>, objectTypes: ReturnType<typeof buildObjectTypeMap>): void {
    validateTypeName(fn.returnType, `fn ${fn.name} return type`, objectTypes);
    for (const p of fn.params) {
        validateTypeName(p.paramType, `fn ${fn.name} param '${p.name}'`, objectTypes);
    }

    const localScope = new Map<string, string>();
    for (const p of fn.params) {
        localScope.set(p.name, p.paramType);
    }

    for (const stmt of fn.body) {
        checkStmt(stmt, localScope, fnSigs, fn.returnType, objectTypes);
    }
}
