/**
 * Type annotation parsing utilities for the parser.
 */

import { Token, TokenType } from '../lexer/lexer.js';

export interface ParsedTypeAnnotation {
    baseType: string;
    fullType: string;
    arraySize?: number;
    arraySizeName?: string;
    dynamicArray?: boolean;
}

export class TypeAnnotationParser {
    private tokens: Token[];
    private pos = 0;

    constructor(tokens: Token[], startPos: number) {
        this.tokens = tokens;
        this.pos = startPos;
    }

    private peek(): Token {
        return this.tokens[this.pos];
    }

    private advance(): Token {
        return this.tokens[this.pos++];
    }

    private check(type: TokenType): boolean {
        return this.peek().type === type;
    }

    private match(type: TokenType): boolean {
        if (this.check(type)) {
            this.advance();
            return true;
        }
        return false;
    }

    private eat(type: TokenType): Token {
        const t = this.peek();
        if (t.type !== type) {
            throw new Error(`Expected ${type} but got ${t.type} ('${t.value}') at line ${t.line}`);
        }
        return this.advance();
    }

    parse(): { annotation: ParsedTypeAnnotation; newPos: number } {
        const baseType = this.eat('IDENT').value;

        if (!this.match('LBRACKET')) {
            return { annotation: { baseType, fullType: baseType }, newPos: this.pos };
        }

        if (this.match('RBRACKET')) {
            return {
                annotation: {
                    baseType,
                    fullType: `${baseType}[]`,
                    dynamicArray: true,
                },
                newPos: this.pos,
            };
        }

        if (this.check('NUMBER')) {
            const sizeToken = this.advance();
            this.eat('RBRACKET');
            return {
                annotation: {
                    baseType,
                    fullType: `${baseType}[${sizeToken.value}]`,
                    arraySize: Number(sizeToken.value),
                },
                newPos: this.pos,
            };
        }

        if (this.check('IDENT')) {
            const sizeName = this.advance().value;
            this.eat('RBRACKET');
            return {
                annotation: {
                    baseType,
                    fullType: `${baseType}[${sizeName}]`,
                    arraySizeName: sizeName,
                    dynamicArray: true,
                },
                newPos: this.pos,
            };
        }

        const t = this.peek();
        throw new Error(`Expected array size identifier, number, or ']' but got ${t.type} ('${t.value}') at line ${t.line}`);
    }
}
