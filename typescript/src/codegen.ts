import { Program, FnDecl, Stmt, Expr } from './parser';

// Infer whether an expression is a string (for printf format selection)
function isStringExpr(expr: Expr): boolean {
  return expr.kind === 'String';
}

export function generate(program: Program): string {
  const lines: string[] = [];
  lines.push('#include <stdio.h>');
  lines.push('');

  // Forward-declare all functions except main
  for (const fn of program.fns) {
    if (fn.name !== 'main') {
      const params = fn.params.map(p => `long ${p}`).join(', ') || 'void';
      lines.push(`long ${fn.name}(${params});`);
    }
  }
  if (program.fns.some(f => f.name !== 'main')) lines.push('');

  for (const fn of program.fns) {
    lines.push(genFn(fn));
    lines.push('');
  }

  return lines.join('\n');
}

function genFn(fn: FnDecl): string {
  const isMain = fn.name === 'main';
  const retType = isMain ? 'int' : 'long';
  const params = isMain
    ? 'void'
    : (fn.params.map(p => `long ${p}`).join(', ') || 'void');

  const body = fn.body.map(s => indent(genStmt(s))).join('\n');
  const footer = isMain ? '\n    return 0;' : '';
  return `${retType} ${fn.name}(${params}) {\n${body}${footer}\n}`;
}

function indent(s: string): string {
  return s.split('\n').map(l => '    ' + l).join('\n');
}

function genStmt(stmt: Stmt): string {
  switch (stmt.kind) {
    case 'VarDecl':
      return `long ${stmt.name} = ${genExpr(stmt.init)};`;

    case 'Assign':
      return `${stmt.name} = ${genExpr(stmt.value)};`;

    case 'Return':
      return `return ${genExpr(stmt.value)};`;

    case 'Print': {
      const arg = stmt.arg;
      if (isStringExpr(arg)) {
        const escaped = (arg as Extract<Expr, { kind: 'String' }>).value
          .replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `printf("%s\\n", "${escaped}");`;
      }
      return `printf("%ld\\n", (long)(${genExpr(arg)}));`;
    }

    case 'If': {
      const cond = genExpr(stmt.cond);
      const then = stmt.then.map(s => indent(genStmt(s))).join('\n');
      let out = `if (${cond}) {\n${then}\n}`;
      if (stmt.else_.length > 0) {
        const else_ = stmt.else_.map(s => indent(genStmt(s))).join('\n');
        out += ` else {\n${else_}\n}`;
      }
      return out;
    }

    case 'While': {
      const cond = genExpr(stmt.cond);
      const body = stmt.body.map(s => indent(genStmt(s))).join('\n');
      return `while (${cond}) {\n${body}\n}`;
    }

    case 'ExprStmt':
      return `${genExpr(stmt.expr)};`;
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
