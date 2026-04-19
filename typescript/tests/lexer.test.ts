import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lex, Token } from '../src/lexer/lexer.js';

function types(tokens: Token[]) {
    return tokens.map((t) => t.type);
}

function values(tokens: Token[]) {
    return tokens.map((t) => t.value);
}

describe('lex', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('given empty input, expects only EOF', () => {
        const tokens = lex('');
        expect(tokens).toEqual([{ type: 'EOF', value: '', line: 1 }]);
    });

    describe('numbers', () => {
        it('given single digit, expects NUMBER token with correct value', () => {
            const tokens = lex('7');
            expect(tokens[0]).toEqual({ type: 'NUMBER', value: '7', line: 1 });
        });

        it('given multi-digit number, expects single NUMBER token', () => {
            const tokens = lex('1234');
            expect(tokens[0]).toEqual({ type: 'NUMBER', value: '1234', line: 1 });
        });
    });

    describe('strings', () => {
        it('given simple quoted string, expects STRING token with inner value', () => {
            const tokens = lex('"hello"');
            expect(tokens[0]).toEqual({ type: 'STRING', value: 'hello', line: 1 });
        });

        it('given string with escaped quote, expects STRING token with literal quote in value', () => {
            const tokens = lex('"say \\"hi\\""');
            expect(tokens[0]).toEqual({ type: 'STRING', value: 'say "hi"', line: 1 });
        });

        it('given empty string, expects STRING token with empty value', () => {
            const tokens = lex('""');
            expect(tokens[0]).toEqual({ type: 'STRING', value: '', line: 1 });
        });
    });

    describe('keywords', () => {
        it.each([
            ['let x', 'LET'],
            ['fn foo', 'FN'],
            ['if x', 'IF'],
            ['else', 'ELSE'],
            ['while x', 'WHILE'],
            ['return x', 'RETURN'],
            ['print(x)', 'PRINT'],
        ] as const)('given "%s", expects first token to be %s', (src, expected) => {
            expect(lex(src)[0].type).toBe(expected);
        });
    });

    describe('identifiers', () => {
        it('given plain word, expects IDENT', () => {
            const tokens = lex('myVar');
            expect(tokens[0]).toEqual({ type: 'IDENT', value: 'myVar', line: 1 });
        });

        it('given identifier with underscores and digits, expects IDENT', () => {
            const tokens = lex('_foo_2');
            expect(tokens[0]).toEqual({ type: 'IDENT', value: '_foo_2', line: 1 });
        });

        it('given keyword-prefixed word, expects IDENT not keyword', () => {
            const tokens = lex('letter');
            expect(tokens[0]).toEqual({ type: 'IDENT', value: 'letter', line: 1 });
        });
    });

    describe('operators', () => {
        it.each([
            ['+', 'PLUS'],
            ['-', 'MINUS'],
            ['*', 'STAR'],
            ['/', 'SLASH'],
            ['=', 'EQ'],
            ['<', 'LT'],
            ['>', 'GT'],
            ['==', 'EQEQ'],
            ['!=', 'NEQ'],
            ['<=', 'LTE'],
            ['>=', 'GTE'],
        ] as const)('given "%s", expects %s', (src, expected) => {
            expect(lex(src)[0].type).toBe(expected);
        });
    });

    describe('punctuation', () => {
        it.each([
            ['(', 'LPAREN'],
            [')', 'RPAREN'],
            ['{', 'LBRACE'],
            ['}', 'RBRACE'],
            [',', 'COMMA'],
            [';', 'SEMI'],
        ] as const)('given "%s", expects %s', (src, expected) => {
            expect(lex(src)[0].type).toBe(expected);
        });
    });

    describe('whitespace and newlines', () => {
        it('given spaces between tokens, skips whitespace', () => {
            const tokens = lex('1   +   2');
            expect(types(tokens)).toEqual(['NUMBER', 'PLUS', 'NUMBER', 'EOF']);
            expect(values(tokens)).toEqual(['1', '+', '2', '']);
        });

        it('given newlines between tokens, increments line counter', () => {
            const tokens = lex('1\n2');
            expect(tokens[0].line).toBe(1);
            expect(tokens[1].line).toBe(2);
        });

        it('given multiple newlines, tracks line correctly for later token', () => {
            const tokens = lex('\n\n\nfoo');
            expect(tokens[0]).toEqual({ type: 'IDENT', value: 'foo', line: 4 });
        });
    });

    describe('comments', () => {
        it('given line comment, ignores comment content', () => {
            const tokens = lex('1 // this is ignored\n2');
            expect(types(tokens)).toEqual(['NUMBER', 'NUMBER', 'EOF']);
            expect(values(tokens)).toEqual(['1', '2', '']);
        });

        it('given comment on its own line, emits no token for it', () => {
            const tokens = lex('// just a comment\nfoo');
            expect(tokens[0]).toEqual({ type: 'IDENT', value: 'foo', line: 2 });
        });

        it('given slash that is not a comment, expects SLASH token', () => {
            const tokens = lex('a / b');
            expect(tokens[1].type).toBe('SLASH');
        });
    });

    describe('line tracking', () => {
        it('given tokens on the same line, all have same line number', () => {
            const tokens = lex('a + b');
            expect(tokens.every((t) => t.line === 1)).toBe(true);
        });
    });

    describe('EOF', () => {
        it('given any input, always ends with EOF token', () => {
            const tokens = lex('fn main() {}');
            expect(tokens.at(-1)).toEqual({ type: 'EOF', value: '', line: 1 });
        });
    });

    describe('complex programs', () => {
        it('given variable declaration, expects correct token sequence', () => {
            const tokens = lex('let x int32 = 5;');
            expect(types(tokens)).toEqual(['LET', 'IDENT', 'IDENT', 'EQ', 'NUMBER', 'SEMI', 'EOF']);
            expect(values(tokens)).toEqual(['let', 'x', 'int32', '=', '5', ';', '']);
        });

        it('given function call, expects correct token sequence', () => {
            const tokens = lex('add(1, 2)');
            expect(types(tokens)).toEqual(['IDENT', 'LPAREN', 'NUMBER', 'COMMA', 'NUMBER', 'RPAREN', 'EOF']);
        });

        it('given comparison expression, expects two-char op tokens', () => {
            const tokens = lex('x == y != z <= w >= v');
            expect(types(tokens)).toEqual(['IDENT', 'EQEQ', 'IDENT', 'NEQ', 'IDENT', 'LTE', 'IDENT', 'GTE', 'IDENT', 'EOF']);
        });
    });

    describe('errors', () => {
        it('given unexpected character, expects throw with line info', () => {
            expect(() => lex('@')).toThrow("Unexpected character '@' at line 1");
        });

        it('given unexpected character on second line, expects throw with correct line', () => {
            expect(() => lex('foo\n@')).toThrow("Unexpected character '@' at line 2");
        });
    });
});
