import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCompletionItemProvider(
    'yap',
    {
      provideCompletionItems(document, position, token, context) {
        const completions: vscode.CompletionItem[] = [];
        const mathModule = 'std/Math';

        // Keywords
        completions.push(createCompletion('var', 'var ${1:name} = ${2:value};', vscode.CompletionItemKind.Keyword, 'Variable declaration'));
        completions.push(createCompletion('fn', 'fn ${1:name}(${2:params}) {\n\t${3:// body}\n}', vscode.CompletionItemKind.Keyword, 'Function declaration'));
        completions.push(createCompletion('export fn', 'export fn ${1:name}(${2:params}) {\n\t${3:// body}\n}', vscode.CompletionItemKind.Keyword, 'Exported function declaration'));
        completions.push(createCompletion('if', 'if (${1:condition}) {\n\t${2:// code}\n}', vscode.CompletionItemKind.Keyword, 'If statement'));
        completions.push(createCompletion('else', 'else {\n\t${1:// code}\n}', vscode.CompletionItemKind.Keyword, 'Else statement'));
        completions.push(createCompletion('while', 'while (${1:condition}) {\n\t${2:// code}\n}', vscode.CompletionItemKind.Keyword, 'While loop'));
        completions.push(createCompletion('return', 'return ${1:value};', vscode.CompletionItemKind.Keyword, 'Return statement'));
        completions.push(createCompletion('import', 'import { ${1:name} } from "${2:path}";', vscode.CompletionItemKind.Keyword, 'Import named exports'));
        completions.push(createCompletion('import all', 'import "${1:path}";', vscode.CompletionItemKind.Keyword, 'Import all exports'));

        // Built-in functions
        completions.push(createCompletion('print', 'print(${1:value});', vscode.CompletionItemKind.Function, 'Print to console'));
        completions.push(createCompletion('read', 'read("${1:path}")', vscode.CompletionItemKind.Function, 'Read file contents'));
        completions.push(createCompletion('write', 'write("${1:path}", ${2:content});', vscode.CompletionItemKind.Function, 'Write file contents'));
        completions.push(createCompletion('append', 'append("${1:path}", ${2:content});', vscode.CompletionItemKind.Function, 'Append file contents'));
        completions.push(createCompletion('push', 'push(${1:array}, ${2:value})', vscode.CompletionItemKind.Function, 'Push value to array'));
        completions.push(createCompletion('pop', 'pop(${1:array})', vscode.CompletionItemKind.Function, 'Pop value from array'));

        // Standard library (std/Math) with auto-import
        const mathFunctions: Array<{ name: string; snippet: string; doc: string }> = [
          { name: 'abs', snippet: 'abs(${1:x})', doc: 'Math.abs (std/Math)' },
          { name: 'sign', snippet: 'sign(${1:x})', doc: 'Math.sign (std/Math)' },
          { name: 'max', snippet: 'max(${1:a}, ${2:b})', doc: 'Math.max (std/Math)' },
          { name: 'min', snippet: 'min(${1:a}, ${2:b})', doc: 'Math.min (std/Math)' },
          { name: 'clamp', snippet: 'clamp(${1:x}, ${2:lo}, ${3:hi})', doc: 'Math.clamp (std/Math)' },
          { name: 'is_even', snippet: 'is_even(${1:x})', doc: 'Math.is_even (std/Math)' },
          { name: 'is_odd', snippet: 'is_odd(${1:x})', doc: 'Math.is_odd (std/Math)' },
          { name: 'pow', snippet: 'pow(${1:base}, ${2:exp})', doc: 'Math.pow (std/Math)' },
          { name: 'gcd', snippet: 'gcd(${1:a}, ${2:b})', doc: 'Math.gcd (std/Math)' },
          { name: 'lcm', snippet: 'lcm(${1:a}, ${2:b})', doc: 'Math.lcm (std/Math)' },
          { name: 'factorial', snippet: 'factorial(${1:n})', doc: 'Math.factorial (std/Math)' },
          { name: 'int_sqrt', snippet: 'int_sqrt(${1:n})', doc: 'Math.int_sqrt (std/Math)' }
        ];

        for (const fn of mathFunctions) {
          completions.push(createAutoImportCompletion(document, fn.name, fn.snippet, fn.doc, mathModule));
        }

        // Constants
        completions.push(createCompletion('true', 'true', vscode.CompletionItemKind.Constant, 'Boolean true'));
        completions.push(createCompletion('false', 'false', vscode.CompletionItemKind.Constant, 'Boolean false'));

        // Built-in variables
        completions.push(createCompletion('args', 'args', vscode.CompletionItemKind.Variable, 'Program arguments array'));

        return completions;
      }
    },
    // Trigger on any letter (optional)
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"'
  );

  const formatter = vscode.languages.registerDocumentFormattingEditProvider('yap', {
    provideDocumentFormattingEdits(document) {
      return formatDocument(document, 4);
    }
  });

  context.subscriptions.push(provider, formatter);
}

function createCompletion(
  label: string,
  insertText: string,
  kind: vscode.CompletionItemKind,
  documentation: string
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(label, kind);
  item.insertText = new vscode.SnippetString(insertText);
  item.documentation = new vscode.MarkdownString(documentation);
  item.detail = 'YAP';
  return item;
}

export function deactivate() {}

function createAutoImportCompletion(
  document: vscode.TextDocument,
  label: string,
  insertText: string,
  documentation: string,
  modulePath: string
): vscode.CompletionItem {
  const item = createCompletion(label, insertText, vscode.CompletionItemKind.Function, documentation);
  const edits = buildAutoImportEdits(document, label, modulePath);
  if (edits.length > 0) {
    item.additionalTextEdits = edits;
  }
  return item;
}

function buildAutoImportEdits(
  document: vscode.TextDocument,
  symbol: string,
  modulePath: string
): vscode.TextEdit[] {
  const text = document.getText();
  const lines = text.split(/\r?\n/);

  const importAllRegex = new RegExp(`^\\s*import\\s+["']${escapeRegExp(modulePath)}["']\\s*;`, 'm');
  if (importAllRegex.test(text)) {
    return [];
  }

  const namedImportRegex = new RegExp(`^\\s*import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escapeRegExp(modulePath)}["']\\s*;`, 'm');
  const match = text.match(namedImportRegex);
  if (match && typeof match.index === 'number') {
    const existingList = match[1].split(',').map(s => s.trim()).filter(Boolean);
    if (existingList.includes(symbol)) {
      return [];
    }

    const line = text.slice(0, match.index).split(/\r?\n/).length - 1;
    const lineText = lines[line];
    const startIndex = lineText.indexOf('{');
    const endIndex = lineText.indexOf('}');
    if (startIndex >= 0 && endIndex > startIndex) {
      const insertPos = new vscode.Position(line, endIndex);
      const prefix = existingList.length > 0 ? ', ' : ' ';
      return [vscode.TextEdit.insert(insertPos, `${prefix}${symbol}`)];
    }
  }

  let insertLine = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\b/.test(lines[i])) {
      insertLine = i + 1;
    }
  }

  const importLine = `import { ${symbol} } from "${modulePath}";`;
  const insertPos = new vscode.Position(insertLine, 0);
  const suffix = insertLine < lines.length ? '\n' : '';
  return [vscode.TextEdit.insert(insertPos, `${importLine}${suffix}`)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDocument(document: vscode.TextDocument, indentSize: number): vscode.TextEdit[] {
  const text = document.getText();
  const lines = text.split(/\r?\n/);
  const edits: vscode.TextEdit[] = [];

  let indentLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (line.length > 0) {
        const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.length));
        edits.push(vscode.TextEdit.replace(range, ''));
      }
      continue;
    }

    if (startsWithClosingBrace(trimmed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const desiredIndent = ' '.repeat(indentLevel * indentSize);
    const newLine = desiredIndent + trimmed;

    if (newLine !== line) {
      const range = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, line.length));
      edits.push(vscode.TextEdit.replace(range, newLine));
    }

    if (endsWithOpeningBrace(trimmed)) {
      indentLevel += 1;
    }
  }

  return edits;
}

function startsWithClosingBrace(text: string): boolean {
  return text.startsWith('}') || text.startsWith(']') || text.startsWith(')');
}

function endsWithOpeningBrace(text: string): boolean {
  return text.endsWith('{') || text.endsWith('[') || text.endsWith('(');
}
