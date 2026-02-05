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
        completions.push(createCompletion('random', 'random()', vscode.CompletionItemKind.Function, 'Random integer'));
        completions.push(createCompletion('timestamp', 'timestamp()', vscode.CompletionItemKind.Function, 'Unix timestamp (seconds)'));

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

  const formatOnSave = vscode.workspace.onWillSaveTextDocument(event => {
    if (event.document.languageId !== 'yap') {
      return;
    }
    const edits = formatDocument(event.document, 4);
    if (edits.length > 0) {
      event.waitUntil(Promise.resolve(edits));
    }
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider('yap', {
    async provideDefinition(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!wordRange) {
        return null;
      }

      const name = document.getText(wordRange);
      const localHit = findFunctionDefinitionInDocument(document, name);
      if (localHit) {
        return localHit;
      }

      return await findFunctionDefinitionInWorkspace(name, document.uri);
    }
  });

  context.subscriptions.push(provider, formatter, formatOnSave, definitionProvider);
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

function findFunctionDefinitionInDocument(
  document: vscode.TextDocument,
  name: string
): vscode.Location | null {
  const text = document.getText();
  const regex = new RegExp(`\\b(?:export\\s+)?fn\\s+${escapeRegExp(name)}\\b`);
  const match = regex.exec(text);
  if (!match || typeof match.index !== 'number') {
    return null;
  }

  const position = document.positionAt(match.index);
  return new vscode.Location(document.uri, position);
}

async function findFunctionDefinitionInWorkspace(
  name: string,
  currentUri: vscode.Uri
): Promise<vscode.Location | null> {
  const files = await vscode.workspace.findFiles('**/*.yap', '**/node_modules/**');
  for (const uri of files) {
    if (uri.toString() === currentUri.toString()) {
      continue;
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    const hit = findFunctionDefinitionInDocument(doc, name);
    if (hit) {
      return hit;
    }
  }

  return null;
}

function formatDocument(document: vscode.TextDocument, indentSize: number): vscode.TextEdit[] {
  const text = document.getText();
  const lines = normalizeLines(text.split(/\r?\n/));
  const formattedLines: string[] = [];

  let indentLevel = 0;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      formattedLines.push('');
      continue;
    }

    if (startsWithClosingBrace(trimmed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const desiredIndent = ' '.repeat(indentLevel * indentSize);
    formattedLines.push(desiredIndent + trimmed);

    if (endsWithOpeningBrace(trimmed)) {
      indentLevel += 1;
    }
  }

  const formattedText = formattedLines.join('\n');
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
  if (formattedText === text) {
    return [];
  }

  return [vscode.TextEdit.replace(fullRange, formattedText)];
}

function normalizeLines(lines: string[]): string[] {
  const out: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      out.push(line);
      continue;
    }

    if (trimmed === '{' && out.length > 0) {
      const prev = out[out.length - 1];
      if (isBlockHeader(prev)) {
        const joined = prev.replace(/\s*\{\s*$/, '') + '{';
        out[out.length - 1] = normalizeBraceSpacing(joined);
        continue;
      }
    }

    let normalized = normalizeBraceSpacing(trimmed);
    let parts = splitElseInline(normalized);
    if (parts.length === 1) {
      parts = splitInlineBrace(parts[0]);
    }

    for (const part of parts) {
      out.push(part);
    }
  }

  return out;
}

function splitInlineBrace(text: string): string[] {
  if (isImportLine(text)) {
    return [text];
  }

  if (!isBlockHeader(text)) {
    return [text];
  }

  const braceIndex = text.indexOf('{');
  if (braceIndex === -1) {
    return [text];
  }

  const before = text.slice(0, braceIndex + 1).trimEnd();
  const after = text.slice(braceIndex + 1).trim();

  if (after.length === 0) {
    return [text];
  }

  if (after.startsWith('}')) {
    return [text];
  }

  const parts: string[] = [before, after];

  if (after.endsWith('}')) {
    const inner = after.slice(0, -1).trim();
    if (inner.length > 0) {
      parts[1] = inner;
      parts.push('}');
    }
  }

  return parts;
}

function isImportLine(text: string): boolean {
  return /^\s*import\b/.test(text);
}

function isBlockHeader(text: string): boolean {
  return /^\s*(if|else|while|fn|export\s+fn)\b/.test(text);
}

function splitElseInline(text: string): string[] {
  const match = text.match(/^}(\s*)else(\s*)\{(.*)$/);
  if (!match) {
    return [text];
  }

  const rest = match[3].trim();
  const parts: string[] = ['}', 'else {'];
  if (rest.length > 0) {
    if (rest.endsWith('}')) {
      const inner = rest.slice(0, -1).trim();
      if (inner.length > 0) {
        parts.push(inner);
      }
      parts.push('}');
    } else {
      parts.push(rest);
    }
  }

  return parts;
}

function normalizeBraceSpacing(text: string): string {
  if (isImportLine(text)) {
    return text;
  }

  let out = text;
  out = out.replace(/^else\s*\{/, 'else {');
  out = out.replace(/^if\s*\((.*)\)\s*\{/, 'if ($1) {');
  out = out.replace(/^while\s*\((.*)\)\s*\{/, 'while ($1) {');
  out = out.replace(/^(export\s+fn|fn)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*\{/, '$1 $2($3) {');
  return out;
}

function startsWithClosingBrace(text: string): boolean {
  return text.startsWith('}') || text.startsWith(']') || text.startsWith(')');
}

function endsWithOpeningBrace(text: string): boolean {
  if (isImportLine(text)) {
    return false;
  }
  return text.endsWith('{') || text.endsWith('[') || text.endsWith('(');
}
