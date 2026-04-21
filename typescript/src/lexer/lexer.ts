export type TokenType =
    | 'NUMBER' // e.g. 123
    | 'STRING' // e.g. "hello"
    | 'IDENT' // e.g. myVar
    | 'LET' // 'let' keyword
    | 'FN' // 'fn' keyword
    | 'IF' // 'if' keyword
    | 'ELSE' // 'else' keyword
    | 'WHILE' // 'while' keyword
    | 'RETURN' // 'return' keyword
    | 'PRINT' // 'print' keyword
    | 'IMPORT' // 'import' keyword
    | 'PLUS' // '+'
    | 'MINUS' // '-'
    | 'STAR' // '*'
    | 'SLASH' // '/'
    | 'EQ' // '='
    | 'EQEQ' // '=='
    | 'NEQ' // '!='
    | 'LT' // '<'
    | 'GT' // '>'
    | 'LTE' // '<='
    | 'GTE' // '>='
    | 'LPAREN' // '('
    | 'RPAREN' // ')'
    | 'LBRACE' // '{'
    | 'RBRACE' // '}'
    | 'LBRACKET' // '['
    | 'RBRACKET' // ']'
    | 'DOT' // '.'
    | 'COMMA' // ','
    | 'SEMI' // ';'
    | 'BOOLEAN' // true/false literals
    | 'EOF'; // end of file

export interface Token {
    type: TokenType;
    value: string;
    line: number;
}

const KEYWORDS: Record<string, TokenType> = {
    let: 'LET',
    fn: 'FN',
    if: 'IF',
    else: 'ELSE',
    while: 'WHILE',
    return: 'RETURN',
    print: 'PRINT',
    import: 'IMPORT',
    true: 'BOOLEAN',
    false: 'BOOLEAN',
};

/**
 * Converts raw YAP source text into a flat token stream.
 *
 * Handles whitespace, line comments, numeric/string literals,
 * identifiers/keywords, operators, and punctuation.
 *
 * @param source Raw source text.
 * @returns Token list ending with an `EOF` token.
 * @throws {Error} If an unexpected character is encountered.
 */
export function lex(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;

    while (i < source.length) {
        const ch = source[i];

        // Whitespace
        if (ch === '\n') {
            line++;
            i++;
            continue;
        }
        if (/\s/.test(ch)) {
            i++;
            continue;
        }

        // Line comments
        if (ch === '/' && source[i + 1] === '/') {
            while (i < source.length && source[i] !== '\n') i++;
            continue;
        }

        // Numbers
        if (/[0-9]/.test(ch)) {
            let num = '';
            while (i < source.length && /[0-9]/.test(source[i])) num += source[i++];
            tokens.push({ type: 'NUMBER', value: num, line });
            continue;
        }

        // Strings
        if (ch === '"') {
            let str = '';
            i++; // skip opening quote
            while (i < source.length && source[i] !== '"') {
                if (source[i] === '\\' && source[i + 1] === '"') {
                    str += '"';
                    i += 2;
                } else str += source[i++];
            }
            i++; // skip closing quote
            tokens.push({ type: 'STRING', value: str, line });
            continue;
        }

        // Identifiers / keywords
        if (/[a-zA-Z_]/.test(ch)) {
            let id = '';
            while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) id += source[i++];
            const type = KEYWORDS[id] ?? 'IDENT';
            tokens.push({ type, value: id, line });
            continue;
        }

        // Two-char operators
        const two = source.slice(i, i + 2);
        if (two === '==') {
            tokens.push({ type: 'EQEQ', value: '==', line });
            i += 2;
            continue;
        }
        if (two === '!=') {
            tokens.push({ type: 'NEQ', value: '!=', line });
            i += 2;
            continue;
        }
        if (two === '<=') {
            tokens.push({ type: 'LTE', value: '<=', line });
            i += 2;
            continue;
        }
        if (two === '>=') {
            tokens.push({ type: 'GTE', value: '>=', line });
            i += 2;
            continue;
        }

        // Single-char tokens
        const singles: Record<string, TokenType> = {
            '+': 'PLUS',
            '-': 'MINUS',
            '*': 'STAR',
            '/': 'SLASH',
            '=': 'EQ',
            '<': 'LT',
            '>': 'GT',
            '(': 'LPAREN',
            ')': 'RPAREN',
            '{': 'LBRACE',
            '}': 'RBRACE',
            '[': 'LBRACKET',
            ']': 'RBRACKET',
            '.': 'DOT',
            ',': 'COMMA',
            ';': 'SEMI',
        };
        if (singles[ch]) {
            tokens.push({ type: singles[ch], value: ch, line });
            i++;
            continue;
        }

        throw new Error(`Unexpected character '${ch}' at line ${line}`);
    }

    tokens.push({ type: 'EOF', value: '', line });
    return tokens;
}
