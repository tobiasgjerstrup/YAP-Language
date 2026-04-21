import { Expr, FnDecl, ParamDecl, Program, Stmt } from '../parser/parser.js';

// ─── Type helpers ─────────────────────────────────────────────────────────────

interface FixedArrayType {
    baseType: string;
    size: number;
}

function parseFixedArrayType(t: string): FixedArrayType | null {
    const match = t.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[(\d+)\]$/);
    if (!match) return null;
    return { baseType: match[1], size: Number(match[2]) };
}

const BASE_TYPES = new Set(['int32', 'int64', 'string']);
const NUMERIC_TYPES = new Set(['int32', 'int64']);

function validateTypeName(t: string, context: string): void {
    const arr = parseFixedArrayType(t);
    if (arr) {
        if (!BASE_TYPES.has(arr.baseType)) {
            throw new Error(`Unknown type: ${arr.baseType} (in ${context})`);
        }
        if (arr.size <= 0) {
            throw new Error(`Array size must be positive, got ${arr.size} (in ${context})`);
        }
        return;
    }
    if (!BASE_TYPES.has(t)) {
        throw new Error(`Unknown type: ${t} (in ${context})`);
    }
}

function isNumeric(t: string): boolean {
    return NUMERIC_TYPES.has(t);
}

// ─── Function signature map ───────────────────────────────────────────────────

interface FnSig {
    params: ParamDecl[];
    returnType: string;
}

// ─── Expression type inference ────────────────────────────────────────────────

function inferExprType(
    expr: Expr,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
): string {
    switch (expr.kind) {
        case 'Number':
            return 'int32';

        case 'String':
            return 'string';

        case 'Ident': {
            const t = localScope.get(expr.name);
            if (t === undefined) {
                throw new Error(`Unknown variable '${expr.name}'`);
            }
            return t;
        }

        case 'Binary': {
            const leftType = inferExprType(expr.left, localScope, fnSigs);
            const rightType = inferExprType(expr.right, localScope, fnSigs);
            const compOps = new Set(['==', '!=', '<', '>', '<=', '>=']);
            if (compOps.has(expr.op)) {
                if (leftType !== rightType) {
                    throw new Error(
                        `Type mismatch in '${expr.op}': left is '${leftType}', right is '${rightType}'`,
                    );
                }
                return 'int32';
            }
            // Arithmetic: +, -, *, /
            if (!isNumeric(leftType)) {
                throw new Error(
                    `Operator '${expr.op}' requires numeric operands, but left operand is '${leftType}'`,
                );
            }
            if (!isNumeric(rightType)) {
                throw new Error(
                    `Operator '${expr.op}' requires numeric operands, but right operand is '${rightType}'`,
                );
            }
            if (leftType !== rightType) {
                throw new Error(
                    `Type mismatch in '${expr.op}': left is '${leftType}', right is '${rightType}'`,
                );
            }
            return leftType;
        }

        case 'Call': {
            const sig = fnSigs.get(expr.callee);
            if (!sig) {
                throw new Error(`Unknown function '${expr.callee}'`);
            }
            if (expr.args.length !== sig.params.length) {
                throw new Error(
                    `Function '${expr.callee}' expects ${sig.params.length} argument(s), got ${expr.args.length}`,
                );
            }
            for (let i = 0; i < expr.args.length; i++) {
                const argType = inferExprType(expr.args[i], localScope, fnSigs);
                const paramType = sig.params[i].paramType;
                if (argType !== paramType) {
                    throw new Error(
                        `Argument ${i + 1} of '${expr.callee}' expects '${paramType}', got '${argType}'`,
                    );
                }
            }
            return sig.returnType;
        }

        case 'ArrayLiteral': {
            if (expr.elements.length === 0) {
                throw new Error('Cannot infer type of empty array literal');
            }
            const elemType = inferExprType(expr.elements[0], localScope, fnSigs);
            for (let i = 1; i < expr.elements.length; i++) {
                const t = inferExprType(expr.elements[i], localScope, fnSigs);
                if (t !== elemType) {
                    throw new Error(
                        `Array literal has inconsistent element types: '${elemType}' and '${t}'`,
                    );
                }
            }
            return `${elemType}[${expr.elements.length}]`;
        }

        case 'IndexAccess': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
            const arr = parseFixedArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(expr.index, localScope, fnSigs);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            return arr.baseType;
        }

        case 'ArrayLength': {
            const arrayType = inferExprType(expr.array, localScope, fnSigs);
            const arr = parseFixedArrayType(arrayType);
            if (!arr) {
                throw new Error(`'.length' requires an array type, got '${arrayType}'`);
            }
            return 'int32';
        }
    }
}

// ─── Statement checking ───────────────────────────────────────────────────────

function checkStmt(
    stmt: Stmt,
    localScope: Map<string, string>,
    fnSigs: Map<string, FnSig>,
    fnReturnType: string,
): void {
    switch (stmt.kind) {
        case 'VarDecl': {
            const initType = inferExprType(stmt.init, localScope, fnSigs);
            if (stmt.varType === undefined) {
                if (stmt.arraySize !== undefined) {
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
                : stmt.varType;
            validateTypeName(declaredType, `let ${stmt.name}`);

            if (initType !== declaredType) {
                throw new Error(
                    `Type mismatch in 'let ${stmt.name}': declared '${declaredType}', initializer is '${initType}'`,
                );
            }
            localScope.set(stmt.name, declaredType);
            break;
        }

        case 'Assign': {
            const varType = localScope.get(stmt.name);
            if (varType === undefined) {
                throw new Error(`Assignment to unknown variable '${stmt.name}'`);
            }
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
            if (valueType !== varType) {
                throw new Error(
                    `Type mismatch in assignment to '${stmt.name}': expected '${varType}', got '${valueType}'`,
                );
            }
            break;
        }

        case 'IndexAssign': {
            const arrayType = inferExprType(stmt.array, localScope, fnSigs);
            const arr = parseFixedArrayType(arrayType);
            if (!arr) {
                throw new Error(`Cannot index-assign into non-array type '${arrayType}'`);
            }
            const indexType = inferExprType(stmt.index, localScope, fnSigs);
            if (!isNumeric(indexType)) {
                throw new Error(`Array index must be numeric, got '${indexType}'`);
            }
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
            if (valueType !== arr.baseType) {
                throw new Error(
                    `Type mismatch in index assignment: array element type is '${arr.baseType}', value is '${valueType}'`,
                );
            }
            break;
        }

        case 'Return': {
            const valueType = inferExprType(stmt.value, localScope, fnSigs);
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
                if (!partialArrayReturn) {
                    throw new Error(
                        `Return type mismatch: function declares '${fnReturnType}', returning '${valueType}'`,
                    );
                }
            }
            break;
        }

        case 'Print': {
            const argType = inferExprType(stmt.arg, localScope, fnSigs);
            if (parseFixedArrayType(argType)) {
                throw new Error(
                    `Cannot print array type '${argType}' directly; print an element instead`,
                );
            }
            if (!isNumeric(argType) && argType !== 'string') {
                throw new Error(`Cannot print value of type '${argType}'`);
            }
            break;
        }

        case 'If': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs);
            if (!isNumeric(condType)) {
                throw new Error(`'if' condition must be numeric, got '${condType}'`);
            }
            for (const s of stmt.then) checkStmt(s, localScope, fnSigs, fnReturnType);
            for (const s of stmt.else_) checkStmt(s, localScope, fnSigs, fnReturnType);
            break;
        }

        case 'While': {
            const condType = inferExprType(stmt.cond, localScope, fnSigs);
            if (!isNumeric(condType)) {
                throw new Error(`'while' condition must be numeric, got '${condType}'`);
            }
            for (const s of stmt.body) checkStmt(s, localScope, fnSigs, fnReturnType);
            break;
        }

        case 'ExprStmt':
            inferExprType(stmt.expr, localScope, fnSigs);
            break;
    }
}

// ─── Function checking ────────────────────────────────────────────────────────

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

// ─── Public entry point ───────────────────────────────────────────────────────

export function typecheckProgram(program: Program): void {
    const fnSigs = new Map<string, FnSig>(
        program.fns.map((fn) => [fn.name, { params: fn.params, returnType: fn.returnType }]),
    );

    for (const fn of program.fns) {
        checkFn(fn, fnSigs);
    }
}
