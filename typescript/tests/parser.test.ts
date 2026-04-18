import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Parser } from '../src/parser.js';

describe('Parser', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function parse(src: string) {
        return new Parser(src).parseProgram();
    }

    describe('empty program', () => {
        it('given empty source, expects empty fns array', () => {
            expect(parse('')).toEqual({ fns: [] });
        });
    });

    describe('function declarations', () => {
        it('given main with empty body, expects fn with no params and int32 return type', () => {
            const prog = parse('fn main() int32 {}');
            expect(prog.fns).toHaveLength(1);
            expect(prog.fns[0]).toMatchObject({ name: 'main', params: [], returnType: 'int32', body: [] });
        });

        it('given fn with single param, expects param recorded', () => {
            const prog = parse('fn double(x int32) int32 {}');
            expect(prog.fns[0].params).toEqual([{ name: 'x', paramType: 'int32' }]);
        });

        it('given fn with multiple params, expects all params recorded', () => {
            const prog = parse('fn add(a int32, b int64) int64 {}');
            expect(prog.fns[0].params).toEqual([
                { name: 'a', paramType: 'int32' },
                { name: 'b', paramType: 'int64' },
            ]);
        });

        it('given fn with string return type, expects returnType string', () => {
            const prog = parse('fn greet() string {}');
            expect(prog.fns[0].returnType).toBe('string');
        });

        it('given multiple functions, expects all recorded in order', () => {
            const prog = parse('fn a() int32 {} fn b() int32 {}');
            expect(prog.fns.map((f) => f.name)).toEqual(['a', 'b']);
        });

        it('given fn without return type, expects throw', () => {
            expect(() => parse('fn foo() {}')).toThrow("Function 'foo' must declare a return type");
        });
    });

    describe('statements', () => {
        describe('VarDecl', () => {
            it('given let with number, expects VarDecl node', () => {
                const prog = parse('fn main() int32 { let x int32 = 5 }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 'x',
                    varType: 'int32',
                    init: { kind: 'Number', value: 5 },
                });
            });

            it('given let with string, expects VarDecl with string init', () => {
                const prog = parse('fn main() int32 { let s string = "hi" }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 's',
                    varType: 'string',
                    init: { kind: 'String', value: 'hi' },
                });
            });
        });

        describe('Assign', () => {
            it('given assignment, expects Assign node', () => {
                const prog = parse('fn main() int32 { x = 10 }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Assign',
                    name: 'x',
                    value: { kind: 'Number', value: 10 },
                });
            });
        });

        describe('Return', () => {
            it('given return statement, expects Return node', () => {
                const prog = parse('fn add(a int32, b int32) int32 { return a }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Return',
                    value: { kind: 'Ident', name: 'a' },
                });
            });
        });

        describe('Print', () => {
            it('given print with number, expects Print node', () => {
                const prog = parse('fn main() int32 { print(42) }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Print',
                    arg: { kind: 'Number', value: 42 },
                });
            });

            it('given print with string literal, expects Print node with String expr', () => {
                const prog = parse('fn main() int32 { print("hello") }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Print',
                    arg: { kind: 'String', value: 'hello' },
                });
            });
        });

        describe('If', () => {
            it('given if without else, expects If node with empty else_', () => {
                const prog = parse('fn main() int32 { if x { print(1) } }');
                const stmt = prog.fns[0].body[0];
                expect(stmt).toMatchObject({
                    kind: 'If',
                    cond: { kind: 'Ident', name: 'x' },
                    then: [{ kind: 'Print', arg: { kind: 'Number', value: 1 } }],
                    else_: [],
                });
            });

            it('given if with else, expects If node with else_ populated', () => {
                const prog = parse('fn main() int32 { if x { print(1) } else { print(0) } }');
                const stmt = prog.fns[0].body[0];
                expect(stmt).toMatchObject({
                    kind: 'If',
                    else_: [{ kind: 'Print', arg: { kind: 'Number', value: 0 } }],
                });
            });
        });

        describe('While', () => {
            it('given while loop, expects While node', () => {
                const prog = parse('fn main() int32 { while x { print(1) } }');
                expect(prog.fns[0].body[0]).toMatchObject({
                    kind: 'While',
                    cond: { kind: 'Ident', name: 'x' },
                    body: [{ kind: 'Print', arg: { kind: 'Number', value: 1 } }],
                });
            });
        });

        describe('ExprStmt', () => {
            it('given standalone call, expects ExprStmt node', () => {
                const prog = parse('fn main() int32 { tick() }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'ExprStmt',
                    expr: { kind: 'Call', callee: 'tick', args: [] },
                });
            });
        });

        describe('optional semicolons', () => {
            it('given semicolons between statements, parses both statements', () => {
                const prog = parse('fn main() int32 { let x int32 = 1; let y int32 = 2 }');
                expect(prog.fns[0].body).toHaveLength(2);
            });
        });
    });

    describe('expressions', () => {
        function parseExpr(src: string) {
            return (new Parser(`fn f() int32 { return ${src} }`).parseProgram().fns[0].body[0] as any).value;
        }

        describe('Number', () => {
            it('given integer literal, expects Number node', () => {
                expect(parseExpr('99')).toEqual({ kind: 'Number', value: 99 });
            });
        });

        describe('String', () => {
            it('given string literal, expects String node', () => {
                expect(parseExpr('"abc"')).toEqual({ kind: 'String', value: 'abc' });
            });
        });

        describe('Ident', () => {
            it('given identifier, expects Ident node', () => {
                expect(parseExpr('myVar')).toEqual({ kind: 'Ident', name: 'myVar' });
            });
        });

        describe('Binary', () => {
            it.each([
                ['+', 'a + b'],
                ['-', 'a - b'],
                ['*', 'a * b'],
                ['/', 'a / b'],
                ['==', 'a == b'],
                ['!=', 'a != b'],
                ['<', 'a < b'],
                ['>', 'a > b'],
                ['<=', 'a <= b'],
                ['>=', 'a >= b'],
            ])('given binary op "%s", expects Binary node', (op, src) => {
                const expr = parseExpr(src);
                expect(expr).toMatchObject({ kind: 'Binary', op });
            });

            it('given nested binary, expects left-associative structure', () => {
                // 1 + 2 + 3 => ((1 + 2) + 3)
                const expr = parseExpr('1 + 2 + 3');
                expect(expr).toMatchObject({
                    kind: 'Binary',
                    op: '+',
                    left: { kind: 'Binary', op: '+', left: { kind: 'Number', value: 1 }, right: { kind: 'Number', value: 2 } },
                    right: { kind: 'Number', value: 3 },
                });
            });

            it('given mul before add, expects mul binds tighter', () => {
                // 1 + 2 * 3 => (1 + (2 * 3))
                const expr = parseExpr('1 + 2 * 3');
                expect(expr).toMatchObject({
                    kind: 'Binary',
                    op: '+',
                    left: { kind: 'Number', value: 1 },
                    right: { kind: 'Binary', op: '*' },
                });
            });

            it('given unary minus, expects Binary with 0 on the left', () => {
                // Unary minus is implemented as (0 - x)
                const expr = parseExpr('-5');
                expect(expr).toEqual({
                    kind: 'Binary',
                    op: '-',
                    left: { kind: 'Number', value: 0 },
                    right: { kind: 'Number', value: 5 },
                });
            });
        });

        describe('Call', () => {
            it('given call with no args, expects Call node with empty args', () => {
                expect(parseExpr('foo()')).toEqual({ kind: 'Call', callee: 'foo', args: [] });
            });

            it('given call with single arg, expects Call node with one arg', () => {
                expect(parseExpr('inc(x)')).toEqual({
                    kind: 'Call',
                    callee: 'inc',
                    args: [{ kind: 'Ident', name: 'x' }],
                });
            });

            it('given call with multiple args, expects all args recorded', () => {
                const expr = parseExpr('add(1, 2, 3)');
                expect(expr).toMatchObject({
                    kind: 'Call',
                    callee: 'add',
                    args: [{ kind: 'Number', value: 1 }, { kind: 'Number', value: 2 }, { kind: 'Number', value: 3 }],
                });
            });
        });

        describe('parentheses', () => {
            it('given parenthesised expression, expects inner expression unwrapped', () => {
                expect(parseExpr('(42)')).toEqual({ kind: 'Number', value: 42 });
            });
        });
    });

    describe('errors', () => {
        it('given mismatched token, expects throw with expected/got info', () => {
            expect(() => parse('fn main) int32 {}')).toThrow('Expected LPAREN');
        });

        it('given unexpected token in expression, expects throw', () => {
            expect(() => parse('fn f() int32 { return @ }')).toThrow('Unexpected');
        });
    });
});
