// ─── AST Node Types ───────────────────────────────────────────────────────────

export type Expr =
    | { kind: 'Number'; value: number }
    | { kind: 'String'; value: string }
    | { kind: 'Ident'; name: string }
    | { kind: 'Binary'; op: string; left: Expr; right: Expr }
    | { kind: 'Call'; callee: string; args: Expr[] }
    | { kind: 'ArrayLiteral'; elements: Expr[] }
    | { kind: 'ObjectLiteral'; fields: ObjectFieldValue[] }
    | { kind: 'ArrayLength'; array: Expr }
    | { kind: 'ArrayPush'; array: Expr; value: Expr }
    | { kind: 'ArrayPop'; array: Expr }
    | { kind: 'IndexAccess'; array: Expr; index: Expr }
    | { kind: 'PropertyAccess'; object: Expr; property: string }
    | { kind: 'Boolean'; value: boolean };

export interface ObjectFieldValue {
    name: string;
    value: Expr;
}

export type Stmt =
    | {
          kind: 'VarDecl';
          name: string;
          varType?: string;
          init: Expr;
          arraySize?: number;
          arraySizeName?: string;
          dynamicArray?: boolean;
      }
    | { kind: 'Assign'; name: string; value: Expr }
    | { kind: 'IndexAssign'; array: Expr; index: Expr; value: Expr }
    | { kind: 'PropertyAssign'; object: Expr; property: string; value: Expr }
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

export interface ObjectTypeField {
    name: string;
    fieldType: string;
}

export interface ObjectTypeDecl {
    name: string;
    fields: ObjectTypeField[];
}

export interface Program {
    fns: FnDecl[];
    imports?: string[];
    objectTypes?: ObjectTypeDecl[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

import { Token, TokenType, lex } from '../lexer/lexer.js';
import { TypeAnnotationParser, ParsedTypeAnnotation } from './type-parser.js';

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

    private parseTypeAnnotation(): ParsedTypeAnnotation {
        const parser = new TypeAnnotationParser(this.tokens, this.pos);
        const { annotation, newPos } = parser.parse();
        this.pos = newPos;
        return annotation;
    }

    // ── Grammar ─────────────────────────────────────────────────────────────────

    /**
     * Parses the full token stream as a sequence of function declarations.
     *
     * @returns Program AST root.
     */
    parseProgram(): Program {
        const fns: FnDecl[] = [];
        const imports: string[] = [];
        const objectTypes: ObjectTypeDecl[] = [];
        while (!this.check('EOF')) {
            if (this.check('IMPORT')) {
                imports.push(this.parseImport());
                continue;
            }
            if (this.check('TYPE')) {
                objectTypes.push(this.parseObjectTypeDecl());
                this.match('SEMI');
                continue;
            }
            fns.push(this.parseFn());
        }
        const program: Program = { fns };
        if (imports.length > 0) {
            program.imports = imports;
        }
        if (objectTypes.length > 0) {
            program.objectTypes = objectTypes;
        }
        return program;
    }

    /**
     * Parses a top-level import declaration.
     *
     * Syntax: import "./path/to/file.yap"[;]
     */
    private parseImport(): string {
        this.eat('IMPORT');
        const pathToken = this.eat('STRING');
        this.match('SEMI');
        return pathToken.value;
    }

    private parseObjectTypeDecl(): ObjectTypeDecl {
        this.eat('TYPE');
        const name = this.eat('IDENT').value;
        this.eat('EQ');
        this.eat('LBRACE');
        const fields: ObjectTypeField[] = [];
        if (!this.check('RBRACE')) {
            fields.push(this.parseObjectTypeField());
            while (this.match('COMMA')) {
                if (this.check('RBRACE')) {
                    break;
                }
                fields.push(this.parseObjectTypeField());
            }
        }
        this.eat('RBRACE');
        return { name, fields };
    }

    private parseObjectTypeField(): ObjectTypeField {
        const name = this.eat('IDENT').value;
        this.eat('COLON');
        const fieldType = this.parseTypeAnnotation().fullType;
        return { name, fieldType };
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
            const firstParamName = this.eat('IDENT').value;
            const firstParamType = this.parseTypeAnnotation();
            params.push({
                name: firstParamName,
                paramType: firstParamType.fullType,
            });
            while (this.match('COMMA')) {
                const paramName = this.eat('IDENT').value;
                const paramType = this.parseTypeAnnotation();
                params.push({
                    name: paramName,
                    paramType: paramType.fullType,
                });
            }
        }
        this.eat('RPAREN');

        let returnType = 'int32';
        if (this.check('IDENT')) {
            returnType = this.parseTypeAnnotation().fullType;
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
            let varType: string | undefined;
            let arraySize: number | undefined;
            let arraySizeName: string | undefined;
            let dynamicArray: boolean | undefined;
            if (!this.check('EQ')) {
                const parsedType = this.parseTypeAnnotation();
                varType = parsedType.baseType;
                arraySize = parsedType.arraySize;
                arraySizeName = parsedType.arraySizeName;
                dynamicArray = parsedType.dynamicArray;
            }
            this.eat('EQ');
            const init = this.parseExpr();
            if (arraySize !== undefined && varType === undefined) {
                throw new Error(`Array declaration for '${name}' requires an explicit element type`);
            }
            if (arraySize !== undefined || arraySizeName !== undefined || dynamicArray) {
                const varDecl: Extract<Stmt, { kind: 'VarDecl' }> = { kind: 'VarDecl', name, varType, init };
                if (arraySize !== undefined) {
                    varDecl.arraySize = arraySize;
                }
                if (arraySizeName !== undefined) {
                    varDecl.arraySizeName = arraySizeName;
                }
                if (dynamicArray) {
                    varDecl.dynamicArray = true;
                }
                return varDecl;
            }
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

        // Assignment: IDENT = expr or IDENT[...] = expr
        if (t.type === 'IDENT') {
            const saved = this.pos;
            const lhs = this.parsePrimary();
            if ((lhs.kind === 'Ident' || lhs.kind === 'IndexAccess' || lhs.kind === 'PropertyAccess') && this.check('EQ')) {
                this.advance(); // eat '='
                const value = this.parseExpr();
                if (lhs.kind === 'Ident') {
                    return { kind: 'Assign', name: lhs.name, value };
                }
                if (lhs.kind === 'PropertyAccess') {
                    return { kind: 'PropertyAssign', object: lhs.object, property: lhs.property, value };
                }
                return { kind: 'IndexAssign', array: lhs.array, index: lhs.index, value };
            }
            this.pos = saved;
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
            return this.parsePostfix({ kind: 'Ident', name: t.value }, t.line);
        }

        if (t.type === 'LBRACKET') {
            this.advance();
            const elements: Expr[] = [];
            if (!this.check('RBRACKET')) {
                elements.push(this.parseExpr());
                while (this.match('COMMA')) {
                    elements.push(this.parseExpr());
                }
            }
            this.eat('RBRACKET');
            return this.parsePostfix({ kind: 'ArrayLiteral', elements }, t.line);
        }

        if (t.type === 'LBRACE') {
            this.advance();
            const fields: ObjectFieldValue[] = [];
            if (!this.check('RBRACE')) {
                fields.push(this.parseObjectLiteralField());
                while (this.match('COMMA')) {
                    if (this.check('RBRACE')) {
                        break;
                    }
                    fields.push(this.parseObjectLiteralField());
                }
            }
            this.eat('RBRACE');
            return this.parsePostfix({ kind: 'ObjectLiteral', fields }, t.line);
        }

        if (t.type === 'LPAREN') {
            this.advance();
            const expr = this.parseExpr();
            this.eat('RPAREN');
            return this.parsePostfix(expr, t.line);
        }

        if (t.type === 'BOOLEAN') {
            this.advance();
            return { kind: 'Boolean', value: t.value === 'true' };
        }

        throw new Error(`Unexpected token ${t.type} ('${t.value}') at line ${t.line}`);
    }

    private parseObjectLiteralField(): ObjectFieldValue {
        const name = this.eat('IDENT').value;
        this.eat('COLON');
        const value = this.parseExpr();
        return { name, value };
    }

    private parsePostfix(base: Expr, line: number): Expr {
        let expr = base;
        while (true) {
            if (this.check('LPAREN')) {
                if (expr.kind !== 'Ident') {
                    throw new Error(`Only identifiers can be called at line ${line}`);
                }
                this.advance();
                const args: Expr[] = [];
                if (!this.check('RPAREN')) {
                    args.push(this.parseExpr());
                    while (this.match('COMMA')) args.push(this.parseExpr());
                }
                this.eat('RPAREN');
                expr = { kind: 'Call', callee: expr.name, args };
                continue;
            }

            if (this.check('LBRACKET')) {
                this.advance();
                const index = this.parseExpr();
                this.eat('RBRACKET');
                expr = { kind: 'IndexAccess', array: expr, index };
                continue;
            }

            if (this.check('DOT')) {
                this.advance();
                const property = this.eat('IDENT');
                if (property.value === 'length') {
                    expr = { kind: 'ArrayLength', array: expr };
                    continue;
                }
                if (property.value === 'push') {
                    this.eat('LPAREN');
                    if (this.check('RPAREN')) {
                        throw new Error(`'push' expects exactly one argument at line ${property.line}`);
                    }
                    const value = this.parseExpr();
                    if (this.match('COMMA')) {
                        throw new Error(`'push' expects exactly one argument at line ${property.line}`);
                    }
                    this.eat('RPAREN');
                    expr = { kind: 'ArrayPush', array: expr, value };
                    continue;
                }
                if (property.value === 'pop') {
                    this.eat('LPAREN');
                    if (!this.check('RPAREN')) {
                        throw new Error(`'pop' does not take arguments at line ${property.line}`);
                    }
                    this.eat('RPAREN');
                    expr = { kind: 'ArrayPop', array: expr };
                    continue;
                }
                expr = { kind: 'PropertyAccess', object: expr, property: property.value };
                continue;
            }

            break;
        }
        return expr;
    }
}
