import * as vscode from 'vscode';
import {
  BASIC_COMPLETION_ENTRIES,
  BUILTIN_DOCS
} from './completion-metadata';

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCompletionItemProvider(
    'yap',
    {
      provideCompletionItems(document, position, token, context) {
        const completions: vscode.CompletionItem[] = [];
        for (const entry of BASIC_COMPLETION_ENTRIES) {
          completions.push(createCompletion(entry.label, entry.insertText, entry.kind, entry.documentation));
        }

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

  const hoverProvider = vscode.languages.registerHoverProvider('yap', {
    async provideHover(document, position) {
      const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!wordRange) {
        return null;
      }

      const name = document.getText(wordRange);
      const doc = getBuiltinDoc(name);
      if (doc) {
        return new vscode.Hover(new vscode.MarkdownString(doc));
      }

      const localFnHover = buildUserFunctionHover(document, name);
      if (localFnHover) {
        return new vscode.Hover(localFnHover);
      }

      const localVarHover = buildUserVariableHover(document, name, position);
      if (localVarHover) {
        return new vscode.Hover(localVarHover);
      }

      const def = await findFunctionDefinitionInWorkspace(name, document.uri);
      if (def) {
        const defDoc = await vscode.workspace.openTextDocument(def.uri);
        const workspaceFnHover = buildUserFunctionHover(defDoc, name);
        if (workspaceFnHover) {
          return new vscode.Hover(workspaceFnHover);
        }
      }

      const varDef = await findVariableDefinitionInWorkspace(name, document.uri);
      if (varDef) {
        const defDoc = await vscode.workspace.openTextDocument(varDef.uri);
        const workspaceVarHover = buildUserVariableHover(defDoc, name, varDef.range.start);
        if (workspaceVarHover) {
          return new vscode.Hover(workspaceVarHover);
        }
      }

      return null;
    }
  });

  context.subscriptions.push(provider, formatter, formatOnSave, definitionProvider, hoverProvider);
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

function getBuiltinDoc(name: string): string | null {
  return BUILTIN_DOCS[name] || null;
}

function buildUserFunctionHover(document: vscode.TextDocument, name: string): vscode.MarkdownString | null {
  const text = document.getText();
  const regex = new RegExp(`\\bfn\\s+${escapeRegExp(name)}\\s*\\(([^)]*)\\)`);
  const match = regex.exec(text);
  if (!match || typeof match.index !== 'number') {
    return null;
  }

  const params = match[1].trim();
  const signature = params.length > 0 ? `fn ${name}(${params})` : `fn ${name}()`;

  const defLine = document.positionAt(match.index).line;
  const docLines: string[] = [];
  for (let line = defLine - 1; line >= 0; line--) {
    const textLine = document.lineAt(line).text.trim();
    if (!textLine.startsWith('//')) {
      break;
    }
    docLines.push(textLine.replace(/^\/\//, '').trim());
  }
  docLines.reverse();

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${name}**\n\n`);
  md.appendCodeblock(signature, 'yap');
  if (docLines.length > 0) {
    md.appendMarkdown(`\n${docLines.join('\n')}\n`);
  }
  return md;
}

function buildUserVariableHover(
  document: vscode.TextDocument,
  name: string,
  position: vscode.Position
): vscode.MarkdownString | null {
  const text = document.getText();
  const regex = new RegExp(`\\blet\\s+${escapeRegExp(name)}\\b([^;]*)`, 'g');
  let match: RegExpExecArray | null = null;
  let bestMatch: RegExpExecArray | null = null;
  let bestLine = -1;

  while ((match = regex.exec(text)) !== null) {
    const defPos = document.positionAt(match.index);
    if (defPos.line > position.line) {
      continue;
    }
    if (defPos.line >= bestLine) {
      bestLine = defPos.line;
      bestMatch = match;
    }
  }

  if (!bestMatch || typeof bestMatch.index !== 'number') {
    return null;
  }

  const defLine = document.positionAt(bestMatch.index).line;
  const tail = bestMatch[1] ? bestMatch[1].trim() : '';
  const signature = tail.length > 0 ? `let ${name}${tail}` : `let ${name}`;

  const docLines: string[] = [];
  for (let line = defLine - 1; line >= 0; line--) {
    const textLine = document.lineAt(line).text.trim();
    if (!textLine.startsWith('//')) {
      break;
    }
    docLines.push(textLine.replace(/^\/\//, '').trim());
  }
  docLines.reverse();

  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${name}**\n\n`);
  md.appendCodeblock(signature, 'yap');
  if (docLines.length > 0) {
    md.appendMarkdown(`\n${docLines.join('\n')}\n`);
  }
  return md;
}


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findFunctionDefinitionInDocument(
  document: vscode.TextDocument,
  name: string
): vscode.Location | null {
  const text = document.getText();
  const regex = new RegExp(`\\bfn\\s+${escapeRegExp(name)}\\b`);
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

async function findVariableDefinitionInWorkspace(
  name: string,
  currentUri: vscode.Uri
): Promise<vscode.Location | null> {
  const files = await vscode.workspace.findFiles('**/*.yap', '**/node_modules/**');
  for (const uri of files) {
    if (uri.toString() === currentUri.toString()) {
      continue;
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    const hit = findVariableDefinitionInDocument(doc, name);
    if (hit) {
      return hit;
    }
  }

  return null;
}

function findVariableDefinitionInDocument(
  document: vscode.TextDocument,
  name: string
): vscode.Location | null {
  const text = document.getText();
  const regex = new RegExp(`\\blet\\s+${escapeRegExp(name)}\\b`);
  const match = regex.exec(text);
  if (!match || typeof match.index !== 'number') {
    return null;
  }

  const position = document.positionAt(match.index);
  return new vscode.Location(document.uri, position);
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

    if (isLineComment(trimmed)) {
      const desiredIndent = ' '.repeat(indentLevel * indentSize);
      formattedLines.push(desiredIndent + trimmed);
      continue;
    }

    const commentSplit = splitLineComment(trimmed);
    const codePart = commentSplit.code.trimEnd();

    if (startsWithClosingBrace(codePart)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const desiredIndent = ' '.repeat(indentLevel * indentSize);
    formattedLines.push(desiredIndent + (commentSplit.comment ? codePart + commentSplit.comment : codePart));

    if (endsWithOpeningBrace(codePart)) {
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

    if (isLineComment(trimmed)) {
      out.push(trimmed);
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

function splitLineComment(text: string): { code: string; comment: string } {
  let inString = false;
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === '"') {
      const prev = i > 0 ? text[i - 1] : '';
      if (prev !== '\\') {
        inString = !inString;
      }
    }
    if (!inString && ch === '/' && text[i + 1] === '/') {
      return { code: text.slice(0, i).trimEnd(), comment: text.slice(i) };
    }
  }
  return { code: text, comment: '' };
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

function isLineComment(text: string): boolean {
  return text.startsWith('//');
}
