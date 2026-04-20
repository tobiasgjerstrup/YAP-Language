import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __private } from '../src/codegen/codegen.js';
import { Expr, FnDecl, Stmt } from '../src/parser/parser.js';

const scalarCtx = {
    fnReturnType: 'int32',
    fnReturnArray: null,
};

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

        it('given string array indexing, expects true', () => {
            const expr: Expr = {
                kind: 'IndexAccess',
                array: { kind: 'Ident', name: 'names' },
                index: { kind: 'Number', value: 0 },
            };
            const varTypes = new Map<string, string>([['names', 'string[2]']]);
            expect(__private.isStringExpr(expr, varTypes, new Map())).toBe(true);
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

        it('given array marker type, expects mapped base C type', () => {
            expect(__private.mapTypeToC('int32[]')).toBe('int32_t');
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

        it('given index access expression, expects bracket syntax', () => {
            const expr: Expr = {
                kind: 'IndexAccess',
                array: { kind: 'Ident', name: 'arr' },
                index: { kind: 'Number', value: 1 },
            };
            expect(__private.genExpr(expr)).toBe('arr[1]');
        });

        it('given array length expression, expects fixed numeric size', () => {
            const expr: Expr = {
                kind: 'ArrayLength',
                array: { kind: 'Ident', name: 'arr' },
            };
            expect(__private.genExpr(expr, new Map([['arr', 'int32[5]']]), new Map())).toBe('5');
        });
    });

    describe('genStmt', () => {
        it('given VarDecl, expects declaration output and updates variable type map', () => {
            const stmt: Stmt = { kind: 'VarDecl', name: 'name', varType: 'string', init: { kind: 'String', value: 'Ada' } };
            const varTypes = new Map<string, string>();
            const out = __private.genStmt(stmt, varTypes, new Map(), scalarCtx);

            expect(out).toBe('char* name = "Ada";');
            expect(varTypes.get('name')).toBe('string');
        });

        it('given Print of known string ident, expects %s printf', () => {
            const stmt: Stmt = { kind: 'Print', arg: { kind: 'Ident', name: 'name' } };
            const varTypes = new Map<string, string>([['name', 'string']]);
            expect(__private.genStmt(stmt, varTypes, new Map(), scalarCtx)).toBe('printf("%s\\n", name);');
        });

        it('given Print of number, expects %ld printf', () => {
            const stmt: Stmt = { kind: 'Print', arg: { kind: 'Number', value: 5 } };
            expect(__private.genStmt(stmt, new Map(), new Map(), scalarCtx)).toBe('printf("%ld\\n", (long)(5));');
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

            expect(__private.genStmt(stmt, new Map(), new Map(), scalarCtx)).toBe(expected);
        });

        it('given While, expects while block output', () => {
            const stmt: Stmt = {
                kind: 'While',
                cond: { kind: 'Ident', name: 'run' },
                body: [{ kind: 'ExprStmt', expr: { kind: 'Call', callee: 'tick', args: [] } }],
            };

            const expected = ['while (run) {', '    tick();', '}'].join('\n');
            expect(__private.genStmt(stmt, new Map(), new Map(), scalarCtx)).toBe(expected);
        });

        it('given IndexAssign, expects array element assignment output', () => {
            const stmt: Stmt = {
                kind: 'IndexAssign',
                array: { kind: 'Ident', name: 'arr' },
                index: { kind: 'Number', value: 0 },
                value: { kind: 'Number', value: 5 },
            };
            expect(__private.genStmt(stmt, new Map(), new Map(), scalarCtx)).toBe('arr[0] = 5;');
        });

        it('given array return literal in array-returning function, expects static-buffer writes and return pointer', () => {
            const stmt: Stmt = {
                kind: 'Return',
                value: {
                    kind: 'ArrayLiteral',
                    elements: [
                        { kind: 'Number', value: 1 },
                        { kind: 'Number', value: 2 },
                    ],
                },
            };
            const out = __private.genStmt(stmt, new Map(), new Map(), {
                fnReturnType: 'int32[4]',
                fnReturnArray: {
                    baseType: 'int32',
                    size: 4,
                    bufferName: '__yap_ret_test',
                },
            });
            expect(out).toBe(['__yap_ret_test[0] = 1;', '__yap_ret_test[1] = 2;', 'return __yap_ret_test;'].join('\n'));
        });

        it('given array declaration initialized from array-returning call, expects copied local array contents', () => {
            const stmt: Stmt = {
                kind: 'VarDecl',
                name: 'local',
                varType: 'int32',
                arraySize: 2,
                init: { kind: 'Call', callee: 'nums', args: [] },
            };
            const out = __private.genStmt(stmt, new Map(), new Map([['nums', 'int32[2]']]), scalarCtx);
            expect(out).toBe(
                [
                    'int32_t local[2] = {0};',
                    'int32_t* __yap_init_local = nums();',
                    'local[0] = __yap_init_local[0];',
                    'local[1] = __yap_init_local[1];',
                ].join('\n'),
            );
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
