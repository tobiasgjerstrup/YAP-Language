import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __private } from '../src/codegen/codegen.js';
import { Expr, FnDecl, Stmt } from '../src/parser/parser.js';

describe('codegen private helpers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isStringExpr', () => {
        it('given a string literal, expects true', () => {
            const expr: Expr = { kind: 'String', value: 'hello' };
            expect(__private.isStringExpr(expr, new Map(), new Map())).toBe(true);
        });

        it('given a string identifier, expects true', () => {
            const expr: Expr = { kind: 'Ident', name: 's' };
            const varTypes = new Map<string, string>([['s', 'string']]);
            expect(__private.isStringExpr(expr, varTypes, new Map())).toBe(true);
        });

        it('given a string-returning call, expects true', () => {
            const expr: Expr = { kind: 'Call', callee: 'greet', args: [] };
            const fnReturnTypes = new Map<string, string>([['greet', 'string']]);
            expect(__private.isStringExpr(expr, new Map(), fnReturnTypes)).toBe(true);
        });

        it('given a number expression, expects false', () => {
            const expr: Expr = { kind: 'Number', value: 123 };
            expect(__private.isStringExpr(expr, new Map(), new Map())).toBe(false);
        });
    });

    describe('indent', () => {
        it('given multiline input, expects each line prefixed by four spaces', () => {
            const input = 'line1\nline2';
            const expected = '    line1\n    line2';
            expect(__private.indent(input)).toBe(expected);
        });
    });

    describe('mapTypeToC', () => {
        it('given int32, expects int32_t', () => {
            expect(__private.mapTypeToC('int32')).toBe('int32_t');
        });

        it('given int64, expects int64_t', () => {
            expect(__private.mapTypeToC('int64')).toBe('int64_t');
        });

        it('given string, expects char*', () => {
            expect(__private.mapTypeToC('string')).toBe('char*');
        });

        it('given unsupported type, expects throw', () => {
            expect(() => __private.mapTypeToC('bool')).toThrow('Unsupported variable type: bool');
        });
    });

    describe('genExpr', () => {
        it('given number, expects numeric string', () => {
            expect(__private.genExpr({ kind: 'Number', value: 7 })).toBe('7');
        });

        it('given string with escapes, expects escaped C string', () => {
            const expr: Expr = { kind: 'String', value: 'a "q" \\ b' };
            expect(__private.genExpr(expr)).toBe('"a \\\"q\\\" \\\\ b"');
        });

        it('given binary expression, expects parenthesized infix expression', () => {
            const expr: Expr = {
                kind: 'Binary',
                op: '+',
                left: { kind: 'Number', value: 1 },
                right: { kind: 'Number', value: 2 },
            };
            expect(__private.genExpr(expr)).toBe('(1 + 2)');
        });

        it('given call expression, expects comma-separated call output', () => {
            const expr: Expr = {
                kind: 'Call',
                callee: 'sum',
                args: [{ kind: 'Number', value: 1 }, { kind: 'Number', value: 2 }],
            };
            expect(__private.genExpr(expr)).toBe('sum(1, 2)');
        });
    });

    describe('genStmt', () => {
        it('given VarDecl, expects declaration output and updates variable type map', () => {
            const stmt: Stmt = { kind: 'VarDecl', name: 'name', varType: 'string', init: { kind: 'String', value: 'Ada' } };
            const varTypes = new Map<string, string>();
            const out = __private.genStmt(stmt, varTypes, new Map());

            expect(out).toBe('char* name = "Ada";');
            expect(varTypes.get('name')).toBe('string');
        });

        it('given Print of known string ident, expects %s printf', () => {
            const stmt: Stmt = { kind: 'Print', arg: { kind: 'Ident', name: 'name' } };
            const varTypes = new Map<string, string>([['name', 'string']]);
            expect(__private.genStmt(stmt, varTypes, new Map())).toBe('printf("%s\\n", name);');
        });

        it('given Print of number, expects %ld printf', () => {
            const stmt: Stmt = { kind: 'Print', arg: { kind: 'Number', value: 5 } };
            expect(__private.genStmt(stmt, new Map(), new Map())).toBe('printf("%ld\\n", (long)(5));');
        });

        it('given If with else, expects full if/else block output', () => {
            const stmt: Stmt = {
                kind: 'If',
                cond: { kind: 'Ident', name: 'ok' },
                then: [{ kind: 'Print', arg: { kind: 'Number', value: 1 } }],
                else_: [{ kind: 'Print', arg: { kind: 'Number', value: 0 } }],
            };

            const expected = [
                'if (ok) {',
                '    printf("%ld\\n", (long)(1));',
                '} else {',
                '    printf("%ld\\n", (long)(0));',
                '}',
            ].join('\n');

            expect(__private.genStmt(stmt, new Map(), new Map())).toBe(expected);
        });

        it('given While, expects while block output', () => {
            const stmt: Stmt = {
                kind: 'While',
                cond: { kind: 'Ident', name: 'run' },
                body: [{ kind: 'ExprStmt', expr: { kind: 'Call', callee: 'tick', args: [] } }],
            };

            const expected = ['while (run) {', '    tick();', '}'].join('\n');
            expect(__private.genStmt(stmt, new Map(), new Map())).toBe(expected);
        });
    });

    describe('genFn', () => {
        it('given main fn, expects int main(void) and appended return 0', () => {
            const fn: FnDecl = {
                name: 'main',
                params: [],
                returnType: 'int32',
                body: [{ kind: 'ExprStmt', expr: { kind: 'Call', callee: 'tick', args: [] } }],
            };

            const expected = ['int main(void) {', '    tick();', '    return 0;', '}'].join('\n');
            expect(__private.genFn(fn, new Map())).toBe(expected);
        });

        it('given non-main fn with typed params, expects mapped signature and body', () => {
            const fn: FnDecl = {
                name: 'echo',
                params: [{ name: 's', paramType: 'string' }],
                returnType: 'string',
                body: [{ kind: 'Return', value: { kind: 'Ident', name: 's' } }],
            };

            const expected = ['char* echo(char* s) {', '    return s;', '}'].join('\n');
            expect(__private.genFn(fn, new Map())).toBe(expected);
        });
    });
});
