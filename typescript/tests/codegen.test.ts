import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generate } from '../src/codegen';
import { Program } from '../src/parser';

function normalizeEol(value: string): string {
    return value.replace(/\r\n/g, '\n');
}

describe('codegen.generate', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('given an int32 print in main, expects numeric printf C output', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [
                        {
                            kind: 'Print',
                            arg: { kind: 'Number', value: 42 },
                        },
                    ],
                },
            ],
        };

        const expected = [
            '#include <stdio.h>',
            '#include <stdint.h>',
            '',
            'int main(void) {',
            '    printf("%ld\\n", (long)(42));',
            '    return 0;',
            '}',
            '',
        ].join('\n');

        expect(normalizeEol(generate(program))).toBe(expected);
    });

    it('given string literal with escapes, expects escaped %s printf output', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [
                        {
                            kind: 'Print',
                            arg: { kind: 'String', value: 'hello "quoted" \\ path' },
                        },
                    ],
                },
            ],
        };

        const output = normalizeEol(generate(program));
        expect(output).toContain('printf("%s\\n", "hello \\\"quoted\\\" \\\\ path");');
    });

    it('given string variable print, expects identifier-based %s printf output', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [
                        { kind: 'VarDecl', name: 'name', varType: 'string', init: { kind: 'String', value: 'Ada' } },
                        { kind: 'Print', arg: { kind: 'Ident', name: 'name' } },
                    ],
                },
            ],
        };

        const expected = [
            '#include <stdio.h>',
            '#include <stdint.h>',
            '',
            'int main(void) {',
            '    char* name = "Ada";',
            '    printf("%s\\n", name);',
            '    return 0;',
            '}',
            '',
        ].join('\n');

        expect(normalizeEol(generate(program))).toBe(expected);
    });

    it('given function returning string, expects forward declaration and call printed as string', () => {
        const program: Program = {
            fns: [
                {
                    name: 'greet',
                    params: [],
                    returnType: 'string',
                    body: [{ kind: 'Return', value: { kind: 'String', value: 'Hi' } }],
                },
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [{ kind: 'Print', arg: { kind: 'Call', callee: 'greet', args: [] } }],
                },
            ],
        };

        const expected = [
            '#include <stdio.h>',
            '#include <stdint.h>',
            '',
            'char* greet(void);',
            '',
            'char* greet(void) {',
            '    return "Hi";',
            '}',
            '',
            'int main(void) {',
            '    printf("%s\\n", greet());',
            '    return 0;',
            '}',
            '',
        ].join('\n');

        expect(normalizeEol(generate(program))).toBe(expected);
    });

    it('given assign, binary, exprstmt, if/else and while, expects structured C statements', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [
                        { kind: 'VarDecl', name: 'x', varType: 'int64', init: { kind: 'Number', value: 10 } },
                        {
                            kind: 'Assign',
                            name: 'x',
                            value: {
                                kind: 'Binary',
                                op: '+',
                                left: { kind: 'Ident', name: 'x' },
                                right: { kind: 'Number', value: 1 },
                            },
                        },
                        { kind: 'ExprStmt', expr: { kind: 'Call', callee: 'tick', args: [{ kind: 'Ident', name: 'x' }] } },
                        {
                            kind: 'If',
                            cond: {
                                kind: 'Binary',
                                op: '>',
                                left: { kind: 'Ident', name: 'x' },
                                right: { kind: 'Number', value: 0 },
                            },
                            then: [{ kind: 'Print', arg: { kind: 'Ident', name: 'x' } }],
                            else_: [{ kind: 'Print', arg: { kind: 'Number', value: 0 } }],
                        },
                        {
                            kind: 'While',
                            cond: {
                                kind: 'Binary',
                                op: '>',
                                left: { kind: 'Ident', name: 'x' },
                                right: { kind: 'Number', value: 5 },
                            },
                            body: [
                                {
                                    kind: 'Assign',
                                    name: 'x',
                                    value: {
                                        kind: 'Binary',
                                        op: '-',
                                        left: { kind: 'Ident', name: 'x' },
                                        right: { kind: 'Number', value: 1 },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        const output = normalizeEol(generate(program));

        expect(output).toContain('int64_t x = 10;');
        expect(output).toContain('x = (x + 1);');
        expect(output).toContain('tick(x);');
        expect(output).toContain('if ((x > 0)) {\n        printf("%ld\\n", (long)(x));\n    } else {\n        printf("%ld\\n", (long)(0));\n    }');
        expect(output).toContain('while ((x > 5)) {\n        x = (x - 1);\n    }');
    });

    it('given non-main function with typed params, expects mapped C signature', () => {
        const program: Program = {
            fns: [
                {
                    name: 'add',
                    params: [
                        { name: 'a', paramType: 'int32' },
                        { name: 'b', paramType: 'int64' },
                    ],
                    returnType: 'int64',
                    body: [
                        {
                            kind: 'Return',
                            value: {
                                kind: 'Binary',
                                op: '+',
                                left: { kind: 'Ident', name: 'a' },
                                right: { kind: 'Ident', name: 'b' },
                            },
                        },
                    ],
                },
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [{ kind: 'Print', arg: { kind: 'Call', callee: 'add', args: [{ kind: 'Number', value: 1 }, { kind: 'Number', value: 2 }] } }],
                },
            ],
        };

        const output = normalizeEol(generate(program));

        expect(output).toContain('int64_t add(int32_t a, int64_t b);');
        expect(output).toContain('int64_t add(int32_t a, int64_t b) {');
        expect(output).toContain('return (a + b);');
        expect(output).toContain('printf("%ld\\n", (long)(add(1, 2)));');
    });

    it('given if without else, expects no else block in output', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [
                        {
                            kind: 'If',
                            cond: { kind: 'Ident', name: 'flag' },
                            then: [{ kind: 'Print', arg: { kind: 'Number', value: 1 } }],
                            else_: [],
                        },
                    ],
                },
            ],
        };

        const output = normalizeEol(generate(program));
        expect(output).toContain('if (flag) {\n        printf("%ld\\n", (long)(1));\n    }');
        expect(output.includes(' else {')).toBe(false);
    });

    it('given unsupported variable type, expects throw with clear message', () => {
        const program: Program = {
            fns: [
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [{ kind: 'VarDecl', name: 'bad', varType: 'float32', init: { kind: 'Number', value: 1 } }],
                },
            ],
        };

        expect(() => generate(program)).toThrow('Unsupported variable type: float32');
    });

    it('given unsupported function return type, expects throw with clear message', () => {
        const program: Program = {
            fns: [
                {
                    name: 'broken',
                    params: [],
                    returnType: 'bool',
                    body: [{ kind: 'Return', value: { kind: 'Number', value: 1 } }],
                },
                {
                    name: 'main',
                    params: [],
                    returnType: 'int32',
                    body: [],
                },
            ],
        };

        expect(() => generate(program)).toThrow('Unsupported variable type: bool');
    });
});
