import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Parser } from '../src/parser/parser.js';

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

        it('given main without explicit return type, expects default int32 return type', () => {
            const prog = parse('fn main() {}');
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

        it('given fn with fixed-size array return type, expects returnType with size suffix', () => {
            const prog = parse('fn nums() int32[10] { return [1, 2, 3] }');
            expect(prog.fns[0].returnType).toBe('int32[10]');
        });

        it('given fn with dynamic array return type, expects unsized returnType', () => {
            const prog = parse('fn nums() int32[] { return [1, 2, 3] }');
            expect(prog.fns[0].returnType).toBe('int32[]');
        });

        it('given fn with runtime-sized array return type, expects symbolic returnType', () => {
            const prog = parse('fn nums(n int32) int32[n] { return [1, 2, 3] }');
            expect(prog.fns[0].returnType).toBe('int32[n]');
        });

        it('given fn with array-typed params, expects param types with suffixes', () => {
            const prog = parse('fn process(staticArr int32[4], dyn int32[], rs int32[n], n int32) int32 { return 0 }');
            expect(prog.fns[0].params).toEqual([
                { name: 'staticArr', paramType: 'int32[4]' },
                { name: 'dyn', paramType: 'int32[]' },
                { name: 'rs', paramType: 'int32[n]' },
                { name: 'n', paramType: 'int32' },
            ]);
        });

        it('given multiple functions, expects all recorded in order', () => {
            const prog = parse('fn a() int32 {} fn b() int32 {}');
            expect(prog.fns.map((f) => f.name)).toEqual(['a', 'b']);
        });

        it('given fn without return type, expects throw', () => {
            expect(() => parse('fn foo() {}')).toThrow("Function 'foo' must declare a return type");
        });
    });

    describe('imports', () => {
        it('given top-level import, records import path', () => {
            const prog = parse('import "./lib.yap" fn main() int32 {}');
            expect(prog.imports).toEqual(['./lib.yap']);
            expect(prog.fns).toHaveLength(1);
        });

        it('given import with semicolon, accepts optional semicolon', () => {
            const prog = parse('import "./lib.yap"; fn main() int32 {}');
            expect(prog.imports).toEqual(['./lib.yap']);
            expect(prog.fns).toHaveLength(1);
        });

        it('given import without string path, expects throw', () => {
            expect(() => parse('import foo fn main() int32 {}')).toThrow("Expected STRING but got IDENT ('foo')");
        });
    });

    describe('object types', () => {
        it('given named object type declaration, records fields and types', () => {
            const prog = parse('type User = { name: string, age: int32 } fn main() int32 {}');
            expect(prog.objectTypes).toEqual([
                {
                    name: 'User',
                    fields: [
                        { name: 'name', fieldType: 'string' },
                        { name: 'age', fieldType: 'int32' },
                    ],
                },
            ]);
            expect(prog.fns).toHaveLength(1);
        });

        it('given nested object and array field types, records full field types', () => {
            const prog = parse('type User = { name: string } type Team = { lead: User, tags: string[] } fn main() int32 {}');
            expect(prog.objectTypes).toEqual([
                {
                    name: 'User',
                    fields: [{ name: 'name', fieldType: 'string' }],
                },
                {
                    name: 'Team',
                    fields: [
                        { name: 'lead', fieldType: 'User' },
                        { name: 'tags', fieldType: 'string[]' },
                    ],
                },
            ]);
        });
    });

    describe('statements', () => {
        describe('VarDecl', () => {
            it('given let without explicit type and number initializer, expects VarDecl with undefined varType', () => {
                const prog = parse('fn main() int32 { let x = 5 }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 'x',
                    varType: undefined,
                    init: { kind: 'Number', value: 5 },
                });
            });

            it('given let without explicit type and array literal, expects inferred-ready VarDecl', () => {
                const prog = parse('fn main() int32 { let arr = [1, 2, 3] }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 'arr',
                    varType: undefined,
                    init: {
                        kind: 'ArrayLiteral',
                        elements: [
                            { kind: 'Number', value: 1 },
                            { kind: 'Number', value: 2 },
                            { kind: 'Number', value: 3 },
                        ],
                    },
                });
            });

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

            it('given fixed-size array declaration, expects VarDecl with arraySize', () => {
                const prog = parse('fn main() int32 { let arr int32[5] = 0 }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 'arr',
                    varType: 'int32',
                    arraySize: 5,
                    init: { kind: 'Number', value: 0 },
                });
            });

            it('given dynamic array declaration, expects VarDecl with dynamicArray flag', () => {
                const prog = parse('fn main() int32 { let arr int32[] = [1, 2, 3] }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'VarDecl',
                    name: 'arr',
                    varType: 'int32',
                    dynamicArray: true,
                    init: {
                        kind: 'ArrayLiteral',
                        elements: [
                            { kind: 'Number', value: 1 },
                            { kind: 'Number', value: 2 },
                            { kind: 'Number', value: 3 },
                        ],
                    },
                });
            });

            it('given runtime-sized declaration, expects VarDecl with arraySizeName', () => {
                const prog = parse('fn main() int32 { let n int32 = 3 let arr int32[n] = [1, 2, 3] }');
                expect(prog.fns[0].body[1]).toEqual({
                    kind: 'VarDecl',
                    name: 'arr',
                    varType: 'int32',
                    dynamicArray: true,
                    arraySizeName: 'n',
                    init: {
                        kind: 'ArrayLiteral',
                        elements: [
                            { kind: 'Number', value: 1 },
                            { kind: 'Number', value: 2 },
                            { kind: 'Number', value: 3 },
                        ],
                    },
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

            it('given indexed assignment, expects IndexAssign node', () => {
                const prog = parse('fn main() int32 { arr[1 + 1] = 10 }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'IndexAssign',
                    array: { kind: 'Ident', name: 'arr' },
                    index: {
                        kind: 'Binary',
                        op: '+',
                        left: { kind: 'Number', value: 1 },
                        right: { kind: 'Number', value: 1 },
                    },
                    value: { kind: 'Number', value: 10 },
                });
            });

            it('given property assignment, expects PropertyAssign node', () => {
                const prog = parse('fn main() int32 { user.profile.name = "Ada" }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'PropertyAssign',
                    object: {
                        kind: 'PropertyAccess',
                        object: { kind: 'Ident', name: 'user' },
                        property: 'profile',
                    },
                    property: 'name',
                    value: { kind: 'String', value: 'Ada' },
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

            it('given print with property access, expects nested PropertyAccess expr', () => {
                const prog = parse('fn main() int32 { print(user.profile.name) }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Print',
                    arg: {
                        kind: 'PropertyAccess',
                        object: {
                            kind: 'PropertyAccess',
                            object: { kind: 'Ident', name: 'user' },
                            property: 'profile',
                        },
                        property: 'name',
                    },
                });
            });

            it('given object literal, expects ObjectLiteral expr with nested values', () => {
                const prog = parse('fn main() int32 { print({ name: "Ada", scores: [1, 2, 3], meta: { active: true } }) }');
                expect(prog.fns[0].body[0]).toEqual({
                    kind: 'Print',
                    arg: {
                        kind: 'ObjectLiteral',
                        fields: [
                            { name: 'name', value: { kind: 'String', value: 'Ada' } },
                            {
                                name: 'scores',
                                value: {
                                    kind: 'ArrayLiteral',
                                    elements: [
                                        { kind: 'Number', value: 1 },
                                        { kind: 'Number', value: 2 },
                                        { kind: 'Number', value: 3 },
                                    ],
                                },
                            },
                            {
                                name: 'meta',
                                value: {
                                    kind: 'ObjectLiteral',
                                    fields: [{ name: 'active', value: { kind: 'Boolean', value: true } }],
                                },
                            },
                        ],
                    },
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

        describe('IndexAccess', () => {
            it('given indexed expression, expects IndexAccess node', () => {
                expect(parseExpr('arr[0]')).toEqual({
                    kind: 'IndexAccess',
                    array: { kind: 'Ident', name: 'arr' },
                    index: { kind: 'Number', value: 0 },
                });
            });

            it('given nested indexing, expects chained IndexAccess nodes', () => {
                expect(parseExpr('grid[i][j]')).toEqual({
                    kind: 'IndexAccess',
                    array: {
                        kind: 'IndexAccess',
                        array: { kind: 'Ident', name: 'grid' },
                        index: { kind: 'Ident', name: 'i' },
                    },
                    index: { kind: 'Ident', name: 'j' },
                });
            });
        });

        describe('ArrayLiteral', () => {
            it('given array literal expression, expects ArrayLiteral node', () => {
                expect(parseExpr('[1, 2, 3]')).toEqual({
                    kind: 'ArrayLiteral',
                    elements: [
                        { kind: 'Number', value: 1 },
                        { kind: 'Number', value: 2 },
                        { kind: 'Number', value: 3 },
                    ],
                });
            });
        });

        describe('ArrayLength', () => {
            it('given local array length expression, expects ArrayLength node', () => {
                expect(parseExpr('big_array.length')).toEqual({
                    kind: 'ArrayLength',
                    array: { kind: 'Ident', name: 'big_array' },
                });
            });

            it('given returned array length expression, expects ArrayLength around call expression', () => {
                expect(parseExpr('return_big_array().length')).toEqual({
                    kind: 'ArrayLength',
                    array: { kind: 'Call', callee: 'return_big_array', args: [] },
                });
            });
        });

        describe('ArrayPush / ArrayPop', () => {
            it('given push expression, expects ArrayPush node', () => {
                expect(parseExpr('arr.push(42)')).toEqual({
                    kind: 'ArrayPush',
                    array: { kind: 'Ident', name: 'arr' },
                    value: { kind: 'Number', value: 42 },
                });
            });

            it('given pop expression, expects ArrayPop node', () => {
                expect(parseExpr('arr.pop()')).toEqual({
                    kind: 'ArrayPop',
                    array: { kind: 'Ident', name: 'arr' },
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

        it('given RPAREN where a primary expression is expected, throws parsePrimary unexpected-token error', () => {
            expect(() => parse('fn f() int32 { return ) }')).toThrow("Unexpected token RPAREN (')') at line 1");
        });

        it('given array declaration with invalid size token, expects throw', () => {
            expect(() => parse('fn main() int32 { let arr int32[+] = 0 }')).toThrow(
                "Expected array size identifier, number, or ']'",
            );
        });

        it('given push call with no args, expects throw', () => {
            expect(() => parse('fn main() int32 { arr.push() }')).toThrow("'push' expects exactly one argument");
        });

        it('given pop call with args, expects throw', () => {
            expect(() => parse('fn main() int32 { arr.pop(1) }')).toThrow("'pop' does not take arguments");
        });

        it('given object literal field without colon, expects throw', () => {
            expect(() => parse('fn main() int32 { print({ name "Ada" }) }')).toThrow(
                "Expected COLON but got STRING ('Ada')",
            );
        });
    });
});
