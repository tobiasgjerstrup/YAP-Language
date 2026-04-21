import { describe, it, expect } from 'vitest';
import { typecheckProgram } from '../src/typecheck/typecheck.js';
import { Program } from '../src/parser/parser.js';
import { Parser } from '../src/parser/parser.js';

function check(src: string): void {
    typecheckProgram(new Parser(src).parseProgram());
}

// ─── Valid programs ──────────────────────────────────────────────────────────

describe('typecheckProgram', () => {
    describe('valid programs', () => {
        it('given simple main with int32 arithmetic, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 1
                        let y int32 = 2
                        let z int32 = x + y
                        print(z)
                    }
                `),
            ).not.toThrow();
        });

        it('given string variable, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let s string = "hello"
                        print(s)
                    }
                `),
            ).not.toThrow();
        });

        it('given function call with matching arg types, expects no error', () => {
            expect(() =>
                check(`
                    fn add(a int32, b int32) int32 {
                        return a + b
                    }
                    fn main() {
                        let x int32 = add(1, 2)
                        print(x)
                    }
                `),
            ).not.toThrow();
        });

        it('given function returning string, expects no error', () => {
            expect(() =>
                check(`
                    fn greet() string {
                        return "hi"
                    }
                    fn main() {
                        let s string = greet()
                        print(s)
                    }
                `),
            ).not.toThrow();
        });

        it('given if/else with numeric condition, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 5
                        if x > 0 {
                            print(x)
                        } else {
                            print(0)
                        }
                    }
                `),
            ).not.toThrow();
        });

        it('given while with numeric condition, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 5
                        while x > 0 {
                            x = x - 1
                        }
                    }
                `),
            ).not.toThrow();
        });

        it('given fixed-size array declaration with matching literal, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[3] = [1, 2, 3]
                        print(arr[0])
                    }
                `),
            ).not.toThrow();
        });

        it('given index assign with matching element type, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[3] = [1, 2, 3]
                        arr[1] = 99
                    }
                `),
            ).not.toThrow();
        });

        it('given comparison with same types, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 1
                        let y int32 = 2
                        let z int32 = x == y
                        print(z)
                    }
                `),
            ).not.toThrow();
        });

        it('given int64 arithmetic, expects no error', () => {
            expect(() =>
                check(`
                    fn big(a int64, b int64) int64 {
                        return a + b
                    }
                    fn main() {
                    }
                `),
            ).not.toThrow();
        });

        it('given array-returning function assigned to matching local, expects no error', () => {
            expect(() =>
                check(`
                    fn nums() int32[3] {
                        return [1, 2, 3]
                    }
                    fn main() {
                        let arr int32[3] = nums()
                        print(arr[0])
                    }
                `),
            ).not.toThrow();
        });

        it('given .length on array variable, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[4] = [1, 2, 3, 4]
                        let n int32 = arr.length
                        print(n)
                    }
                `),
            ).not.toThrow();
        });

        it('given recursive function, expects no error', () => {
            expect(() =>
                check(`
                    fn factorial(n int32) int32 {
                        if n <= 1 {
                            return 1
                        }
                        return n * factorial(n - 1)
                    }
                    fn main() {
                        print(factorial(5))
                    }
                `),
            ).not.toThrow();
        });

        it('given inferred int32 and string locals, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x = 20
                        let s = "hello"
                        print(x)
                        print(s)
                    }
                `),
            ).not.toThrow();
        });

        it('given inferred fixed-size array local, expects no error', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr = [1, 2, 3]
                        print(arr[1])
                    }
                `),
            ).not.toThrow();
        });
    });

    // ─── Type name validation ─────────────────────────────────────────────────

    describe('type name validation', () => {
        it('given unknown variable type, expects throw Unknown type', () => {
            const program: Program = {
                fns: [
                    {
                        name: 'main',
                        params: [],
                        returnType: 'int32',
                        body: [{ kind: 'VarDecl', name: 'x', varType: 'float32', init: { kind: 'Number', value: 1 } }],
                    },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow('Unknown type: float32');
        });

        it('given unknown function return type, expects throw Unknown type', () => {
            const program: Program = {
                fns: [
                    {
                        name: 'broken',
                        params: [],
                        returnType: 'bool',
                        body: [{ kind: 'Return', value: { kind: 'Number', value: 1 } }],
                    },
                    { name: 'main', params: [], returnType: 'int32', body: [] },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow('Unknown type: bool');
        });

        it('given unknown param type, expects throw Unknown type', () => {
            const program: Program = {
                fns: [
                    {
                        name: 'foo',
                        params: [{ name: 'x', paramType: 'uint8' }],
                        returnType: 'int32',
                        body: [{ kind: 'Return', value: { kind: 'Ident', name: 'x' } }],
                    },
                    { name: 'main', params: [], returnType: 'int32', body: [] },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow('Unknown type: uint8');
        });
    });

    // ─── VarDecl type mismatches ──────────────────────────────────────────────

    describe('VarDecl type mismatches', () => {
        it('given inferred empty array literal, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr = []
                    }
                `),
            ).toThrow('Cannot infer type of empty array literal');
        });

        it('given int32 variable initialized with string, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = "hello"
                    }
                `),
            ).toThrow("declared 'int32', initializer is 'string'");
        });

        it('given string variable initialized with number, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let s string = 42
                    }
                `),
            ).toThrow("declared 'string', initializer is 'int32'");
        });

        it('given int32 variable initialized with int64, expects throw', () => {
            const program: Program = {
                fns: [
                    { name: 'foo', params: [], returnType: 'int64', body: [] },
                    {
                        name: 'main',
                        params: [],
                        returnType: 'int32',
                        body: [
                            { kind: 'VarDecl', name: 'x', varType: 'int32', init: { kind: 'Call', callee: 'foo', args: [] } },
                        ],
                    },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow("declared 'int32', initializer is 'int64'");
        });

        it('given int32 array initialized with wrong size literal, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[3] = [1, 2]
                    }
                `),
            ).toThrow("declared 'int32[3]', initializer is 'int32[2]'");
        });

        it('given int32 array initialized from wrong-size function return, expects throw', () => {
            expect(() =>
                check(`
                    fn nums() int32[2] {
                        return [1, 2]
                    }
                    fn main() {
                        let arr int32[3] = nums()
                    }
                `),
            ).toThrow("declared 'int32[3]', initializer is 'int32[2]'");
        });
    });

    // ─── Assignment type mismatches ───────────────────────────────────────────

    describe('Assign type mismatches', () => {
        it('given int32 variable assigned string, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 0
                        x = "oops"
                    }
                `),
            ).toThrow("expected 'int32', got 'string'");
        });

        it('given assignment to unknown variable, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        x = 5
                    }
                `),
            ).toThrow("Assignment to unknown variable 'x'");
        });

        it('given int32 assigned int64, expects throw', () => {
            const program: Program = {
                fns: [
                    { name: 'big', params: [], returnType: 'int64', body: [] },
                    {
                        name: 'main',
                        params: [],
                        returnType: 'int32',
                        body: [
                            { kind: 'VarDecl', name: 'x', varType: 'int32', init: { kind: 'Number', value: 0 } },
                            { kind: 'Assign', name: 'x', value: { kind: 'Call', callee: 'big', args: [] } },
                        ],
                    },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow("expected 'int32', got 'int64'");
        });
    });

    // ─── Return type mismatches ───────────────────────────────────────────────

    describe('Return type mismatches', () => {
        it('given int32 function returning string, expects throw', () => {
            expect(() =>
                check(`
                    fn foo() int32 {
                        return "oops"
                    }
                    fn main() {}
                `),
            ).toThrow("function declares 'int32', returning 'string'");
        });

        it('given string function returning number, expects throw', () => {
            expect(() =>
                check(`
                    fn foo() string {
                        return 42
                    }
                    fn main() {}
                `),
            ).toThrow("function declares 'string', returning 'int32'");
        });

        it('given int32 function returning int64, expects throw', () => {
            expect(() =>
                check(`
                    fn foo() int32 {
                        return 1
                    }
                    fn bar() int64 {
                        return foo()
                    }
                    fn main() {}
                `),
            ).toThrow("function declares 'int64', returning 'int32'");
        });
    });

    // ─── Call type mismatches ─────────────────────────────────────────────────

    describe('Call type mismatches', () => {
        it('given wrong argument count, expects throw', () => {
            expect(() =>
                check(`
                    fn add(a int32, b int32) int32 { return a + b }
                    fn main() {
                        let x int32 = add(1)
                    }
                `),
            ).toThrow("expects 2 argument(s), got 1");
        });

        it('given wrong argument type, expects throw', () => {
            expect(() =>
                check(`
                    fn add(a int32, b int32) int32 { return a + b }
                    fn main() {
                        let x int32 = add(1, "two")
                    }
                `),
            ).toThrow("Argument 2 of 'add' expects 'int32', got 'string'");
        });

        it('given int32 arg where int64 expected, expects throw', () => {
            expect(() =>
                check(`
                    fn big(a int64) int64 { return a }
                    fn main() {
                        let x int32 = 5
                        let y int64 = big(x)
                    }
                `),
            ).toThrow("Argument 1 of 'big' expects 'int64', got 'int32'");
        });

        it('given call to unknown function, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = mystery()
                    }
                `),
            ).toThrow("Unknown function 'mystery'");
        });
    });

    // ─── Binary expression type mismatches ───────────────────────────────────

    describe('Binary expression type mismatches', () => {
        it('given arithmetic on string operands, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let s string = "a"
                        let t string = s + s
                    }
                `),
            ).toThrow("requires numeric operands");
        });

        it('given int32 + int64, expects throw', () => {
            const program: Program = {
                fns: [
                    { name: 'foo', params: [], returnType: 'int64', body: [] },
                    {
                        name: 'main',
                        params: [],
                        returnType: 'int32',
                        body: [
                            { kind: 'VarDecl', name: 'y', varType: 'int64', init: { kind: 'Call', callee: 'foo', args: [] } },
                            {
                                kind: 'VarDecl',
                                name: 'z',
                                varType: 'int32',
                                init: {
                                    kind: 'Binary',
                                    op: '+',
                                    left: { kind: 'Number', value: 5 },
                                    right: { kind: 'Ident', name: 'y' },
                                },
                            },
                        ],
                    },
                ],
            };
            expect(() => typecheckProgram(program)).toThrow("Type mismatch in '+'");
        });

        it('given comparison of int32 and string, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 1
                        let s string = "a"
                        let z int32 = x == s
                    }
                `),
            ).toThrow("Type mismatch in '=='");
        });
    });

    // ─── Index / array mismatches ─────────────────────────────────────────────

    describe('Index and array mismatches', () => {
        it('given index into non-array variable, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 5
                        let y int32 = x[0]
                    }
                `),
            ).toThrow("Cannot index into non-array type 'int32'");
        });

        it('given index-assign with wrong value type, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[3] = [1, 2, 3]
                        arr[0] = "oops"
                    }
                `),
            ).toThrow("array element type is 'int32', value is 'string'");
        });

        it('given array literal with inconsistent element types, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[2] = [1, "two"]
                    }
                `),
            ).toThrow("inconsistent element types");
        });

        it('given .length on non-array, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let x int32 = 5
                        let n int32 = x.length
                    }
                `),
            ).toThrow("'.length' requires an array type");
        });
    });

    // ─── Print mismatches ─────────────────────────────────────────────────────

    describe('Print mismatches', () => {
        it('given print of array directly, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let arr int32[3] = [1, 2, 3]
                        print(arr)
                    }
                `),
            ).toThrow("Cannot print array type 'int32[3]' directly");
        });
    });

    // ─── If / While condition mismatches ──────────────────────────────────────

    describe('If and While condition mismatches', () => {
        it('given if with string condition, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let s string = "yes"
                        if s {
                            print(1)
                        }
                    }
                `),
            ).toThrow("'if' condition must be numeric");
        });

        it('given while with string condition, expects throw', () => {
            expect(() =>
                check(`
                    fn main() {
                        let s string = "loop"
                        while s {
                            print(1)
                        }
                    }
                `),
            ).toThrow("'while' condition must be numeric");
        });
    });
});
