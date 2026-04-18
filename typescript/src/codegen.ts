import { Program, FnDecl, Stmt, Expr } from './parser';

// Infer whether an expression is a string (for printf format selection)
function isStringExpr(
  expr: Expr,
  varTypes: Map<string, string>,
  fnReturnTypes: Map<string, string>,
): boolean {
  if (expr.kind === 'String') return true;
  if (expr.kind === 'Ident') return varTypes.get(expr.name) === 'string';
  if (expr.kind === 'Call') return fnReturnTypes.get(expr.callee) === 'string';
  return false;
}

export function generate(program: Program): string {
  const lines: string[] = [];
  const fnReturnTypes = new Map(program.fns.map(f => [f.name, f.returnType] as const));
  lines.push('#include <stdio.h>');
  lines.push('#include <stdint.h>');
  lines.push('');

  // Forward-declare all functions except main
  for (const fn of program.fns) {
    if (fn.name !== 'main') {
      const params = fn.params.map(p => `${mapTypeToC(p.paramType)} ${p.name}`).join(', ') || 'void';
      lines.push(`${mapTypeToC(fn.returnType)} ${fn.name}(${params});`);
    }
  }
  if (program.fns.some(f => f.name !== 'main')) lines.push('');

  for (const fn of program.fns) {
    lines.push(genFn(fn, fnReturnTypes));
    lines.push('');
  }

  return lines.join('\n');
}

function genFn(fn: FnDecl, fnReturnTypes: Map<string, string>): string {
  const isMain = fn.name === 'main';
  const retType = isMain ? 'int' : mapTypeToC(fn.returnType);
  const params = isMain
    ? 'void'
    : (fn.params.map(p => `${mapTypeToC(p.paramType)} ${p.name}`).join(', ') || 'void');

  const varTypes = new Map<string, string>();
  for (const p of fn.params) {
    varTypes.set(p.name, p.paramType);
  }
  const body = fn.body.map(s => indent(genStmt(s, varTypes, fnReturnTypes))).join('\n');
  const footer = isMain ? '\n    return 0;' : '';
  return `${retType} ${fn.name}(${params}) {\n${body}${footer}\n}`;
}

function indent(s: string): string {
  return s.split('\n').map(l => '    ' + l).join('\n');
}

function genStmt(
  stmt: Stmt,
  varTypes: Map<string, string>,
  fnReturnTypes: Map<string, string>,
): string {
  switch (stmt.kind) {
    case 'VarDecl': {
      varTypes.set(stmt.name, stmt.varType);
      return `${mapTypeToC(stmt.varType)} ${stmt.name} = ${genExpr(stmt.init)};`;
    }

    case 'Assign':
      return `${stmt.name} = ${genExpr(stmt.value)};`;

    case 'Return':
      return `return ${genExpr(stmt.value)};`;

    case 'Print': {
      const arg = stmt.arg;
      if (isStringExpr(arg, varTypes, fnReturnTypes)) {
        if (arg.kind === 'String') {
          const escaped = arg.value
            .replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          return `printf("%s\\n", "${escaped}");`;
        }
        return `printf("%s\\n", ${genExpr(arg)});`;
      }
      return `printf("%ld\\n", (long)(${genExpr(arg)}));`;
    }

    case 'If': {
      const cond = genExpr(stmt.cond);
      const then = stmt.then.map(s => indent(genStmt(s, varTypes, fnReturnTypes))).join('\n');
      let out = `if (${cond}) {\n${then}\n}`;
      if (stmt.else_.length > 0) {
        const else_ = stmt.else_.map(s => indent(genStmt(s, varTypes, fnReturnTypes))).join('\n');
        out += ` else {\n${else_}\n}`;
      }
      return out;
    }

    case 'While': {
      const cond = genExpr(stmt.cond);
      const body = stmt.body.map(s => indent(genStmt(s, varTypes, fnReturnTypes))).join('\n');
      return `while (${cond}) {\n${body}\n}`;
    }

    case 'ExprStmt':
      return `${genExpr(stmt.expr)};`;
  }
}

function mapTypeToC(varType: string): string {
  switch (varType) {
    case 'int32': return 'int32_t';
    case 'int64': return 'int64_t';
    case 'string': return 'char*';
    default:
      throw new Error(`Unsupported variable type: ${varType}`);
  }
}

function genExpr(expr: Expr): string {
  switch (expr.kind) {
    case 'Number': return String(expr.value);
    case 'String': return `"${expr.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    case 'Ident':  return expr.name;
    case 'Binary': return `(${genExpr(expr.left)} ${expr.op} ${genExpr(expr.right)})`;
    case 'Call':   return `${expr.callee}(${expr.args.map(genExpr).join(', ')})`;
  }
}
