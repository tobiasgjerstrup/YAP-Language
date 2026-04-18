// ─── AST Node Types ───────────────────────────────────────────────────────────

export type Expr =
    | { kind: 'Number'; value: number }
    | { kind: 'String'; value: string }
    | { kind: 'Ident'; name: string }
    | { kind: 'Binary'; op: string; left: Expr; right: Expr }
    | { kind: 'Call'; callee: string; args: Expr[] };

export type Stmt =
    | { kind: 'VarDecl'; name: string; varType: string; init: Expr }
    | { kind: 'Assign'; name: string; value: Expr }
    | { kind: 'Print'; arg: Expr }
    | { kind: 'Return'; value: Expr }
    | { kind: 'If'; cond: Expr; then: Stmt[]; else_: Stmt[] }
    | { kind: 'While'; cond: Expr; body: Stmt[] }
    | { kind: 'ExprStmt'; expr: Expr };

export interface ParamDecl {
    name: string;
    paramType: string;
}

export interface FnDecl {
    name: string;
    params: ParamDecl[];
    returnType: string;
    body: Stmt[];
}

export interface Program {
    fns: FnDecl[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

import { Token, TokenType, lex } from './lexer.js';

/**
 * Parses YAP source code into a `Program` AST.
 *
 * @param source Raw YAP source text.
 * @returns Parsed AST containing all function declarations.
 * @throws {Error} If the source contains invalid syntax.
 *
 * @example
 * const parser = new Parser('fn main() int32 { let x int32 = 5 + 3 }');
 * const ast = parser.parseProgram();
 */
export class Parser {
    private tokens: Token[];
    private pos = 0;

    constructor(source: string) {
        this.tokens = lex(source);
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

    private eat(type: TokenType): Token {
        const t = this.peek();
        if (t.type !== type) {
            throw new Error(`Expected ${type} but got ${t.type} ('${t.value}') at line ${t.line}`);
        }
        return this.advance();
    }

    private match(...types: TokenType[]): boolean {
        if (types.includes(this.peek().type)) {
            this.advance();
            return true;
        }
        return false;
    }

    // ── Grammar ─────────────────────────────────────────────────────────────────

    /**
     * Parses the full token stream as a sequence of function declarations.
     *
     * @returns Program AST root.
     */
    parseProgram(): Program {
        const fns: FnDecl[] = [];
        while (!this.check('EOF')) {
            fns.push(this.parseFn());
        }
        return { fns };
    }

    /**
     * Parses a function declaration including signature and block body.
     *
     * @returns Parsed function node.
     * @throws {Error} When required syntax (or non-main return type) is missing.
     */
    private parseFn(): FnDecl {
        this.eat('FN');
        const name = this.eat('IDENT').value;
        this.eat('LPAREN');
        const params: ParamDecl[] = [];
        if (!this.check('RPAREN')) {
            params.push({
                name: this.eat('IDENT').value,
                paramType: this.eat('IDENT').value,
            });
            while (this.match('COMMA')) {
                params.push({
                    name: this.eat('IDENT').value,
                    paramType: this.eat('IDENT').value,
                });
            }
        }
        this.eat('RPAREN');

        let returnType = 'int32';
        if (this.check('IDENT')) {
            returnType = this.eat('IDENT').value;
        } else if (name !== 'main') {
            throw new Error(`Function '${name}' must declare a return type`);
        }

        this.eat('LBRACE');
        const body = this.parseBlock();
        this.eat('RBRACE');
        return { name, params, returnType, body };
    }

    /**
     * Parses statements until a closing brace or EOF is reached.
     *
     * @returns Statement array for a block.
     */
    private parseBlock(): Stmt[] {
        const stmts: Stmt[] = [];
        while (!this.check('RBRACE') && !this.check('EOF')) {
            stmts.push(this.parseStmt());
            this.match('SEMI'); // optional semicolon
        }
        return stmts;
    }

    /**
     * Parses one statement by dispatching on the current token.
     *
     * @returns Parsed statement node.
     */
    private parseStmt(): Stmt {
        const t = this.peek();

        if (t.type === 'LET') {
            this.advance();
            const name = this.eat('IDENT').value;
            const varType = this.eat('IDENT').value;
            this.eat('EQ');
            const init = this.parseExpr();
            return { kind: 'VarDecl', name, varType, init };
        }

        if (t.type === 'RETURN') {
            this.advance();
            const value = this.parseExpr();
            return { kind: 'Return', value };
        }

        if (t.type === 'PRINT') {
            this.advance();
            this.eat('LPAREN');
            const arg = this.parseExpr();
            this.eat('RPAREN');
            return { kind: 'Print', arg };
        }

        if (t.type === 'IF') {
            this.advance();
            const cond = this.parseExpr();
            this.eat('LBRACE');
            const then = this.parseBlock();
            this.eat('RBRACE');
            let else_: Stmt[] = [];
            if (this.check('ELSE')) {
                this.advance();
                this.eat('LBRACE');
                else_ = this.parseBlock();
                this.eat('RBRACE');
            }
            return { kind: 'If', cond, then, else_ };
        }

        if (t.type === 'WHILE') {
            this.advance();
            const cond = this.parseExpr();
            this.eat('LBRACE');
            const body = this.parseBlock();
            this.eat('RBRACE');
            return { kind: 'While', cond, body };
        }

        // Assignment: IDENT = expr
        if (t.type === 'IDENT' && this.tokens[this.pos + 1]?.type === 'EQ') {
            const name = this.advance().value;
            this.advance(); // eat '='
            const value = this.parseExpr();
            return { kind: 'Assign', name, value };
        }

        return { kind: 'ExprStmt', expr: this.parseExpr() };
    }

    // Precedence climbing
    /**
     * Parses a full expression using precedence-aware helpers.
     *
     * @returns Parsed expression node.
     */
    private parseExpr(): Expr {
        return this.parseComparison();
    }

    /**
     * Parses comparison-level binary expressions.
     */
    private parseComparison(): Expr {
        let left = this.parseAddSub();
        const ops = ['EQEQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE'] as TokenType[];
        while (ops.includes(this.peek().type)) {
            const op = this.advance().value;
            left = { kind: 'Binary', op, left, right: this.parseAddSub() };
        }
        return left;
    }

    /**
     * Parses addition/subtraction expressions.
     */
    private parseAddSub(): Expr {
        let left = this.parseMulDiv();
        while (this.check('PLUS') || this.check('MINUS')) {
            const op = this.advance().value;
            left = { kind: 'Binary', op, left, right: this.parseMulDiv() };
        }
        return left;
    }

    /**
     * Parses multiplication/division expressions.
     */
    private parseMulDiv(): Expr {
        let left = this.parseUnary();
        while (this.check('STAR') || this.check('SLASH')) {
            const op = this.advance().value;
            left = { kind: 'Binary', op, left, right: this.parseUnary() };
        }
        return left;
    }

    /**
     * Parses unary expressions (currently unary minus).
     */
    private parseUnary(): Expr {
        if (this.check('MINUS')) {
            this.advance();
            const operand = this.parsePrimary();
            return { kind: 'Binary', op: '-', left: { kind: 'Number', value: 0 }, right: operand };
        }
        return this.parsePrimary();
    }

    /**
     * Parses literals, identifiers, function calls, and parenthesized expressions.
     *
     * @throws {Error} If the current token cannot start a primary expression.
     */
    private parsePrimary(): Expr {
        const t = this.peek();

        if (t.type === 'NUMBER') {
            this.advance();
            return { kind: 'Number', value: Number(t.value) };
        }
        if (t.type === 'STRING') {
            this.advance();
            return { kind: 'String', value: t.value };
        }

        if (t.type === 'IDENT') {
            this.advance();
            if (this.check('LPAREN')) {
                this.advance();
                const args: Expr[] = [];
                if (!this.check('RPAREN')) {
                    args.push(this.parseExpr());
                    while (this.match('COMMA')) args.push(this.parseExpr());
                }
                this.eat('RPAREN');
                return { kind: 'Call', callee: t.value, args };
            }
            return { kind: 'Ident', name: t.value };
        }

        if (t.type === 'LPAREN') {
            this.advance();
            const expr = this.parseExpr();
            this.eat('RPAREN');
            return expr;
        }

        throw new Error(`Unexpected token ${t.type} ('${t.value}') at line ${t.line}`);
    }
}
