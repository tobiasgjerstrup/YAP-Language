import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerCompletionItemProvider(
    'yap',
    {
      provideCompletionItems(document, position, token, context) {
        const completions: vscode.CompletionItem[] = [];

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

        // Standard library (std/Math.yap)
        completions.push(createCompletion('abs', 'abs(${1:x})', vscode.CompletionItemKind.Function, 'Math.abs (std/Math.yap)'));
        completions.push(createCompletion('sign', 'sign(${1:x})', vscode.CompletionItemKind.Function, 'Math.sign (std/Math.yap)'));
        completions.push(createCompletion('max', 'max(${1:a}, ${2:b})', vscode.CompletionItemKind.Function, 'Math.max (std/Math.yap)'));
        completions.push(createCompletion('min', 'min(${1:a}, ${2:b})', vscode.CompletionItemKind.Function, 'Math.min (std/Math.yap)'));
        completions.push(createCompletion('clamp', 'clamp(${1:x}, ${2:lo}, ${3:hi})', vscode.CompletionItemKind.Function, 'Math.clamp (std/Math.yap)'));
        completions.push(createCompletion('is_even', 'is_even(${1:x})', vscode.CompletionItemKind.Function, 'Math.is_even (std/Math.yap)'));
        completions.push(createCompletion('is_odd', 'is_odd(${1:x})', vscode.CompletionItemKind.Function, 'Math.is_odd (std/Math.yap)'));
        completions.push(createCompletion('pow', 'pow(${1:base}, ${2:exp})', vscode.CompletionItemKind.Function, 'Math.pow (std/Math.yap)'));
        completions.push(createCompletion('gcd', 'gcd(${1:a}, ${2:b})', vscode.CompletionItemKind.Function, 'Math.gcd (std/Math.yap)'));
        completions.push(createCompletion('lcm', 'lcm(${1:a}, ${2:b})', vscode.CompletionItemKind.Function, 'Math.lcm (std/Math.yap)'));
        completions.push(createCompletion('factorial', 'factorial(${1:n})', vscode.CompletionItemKind.Function, 'Math.factorial (std/Math.yap)'));
        completions.push(createCompletion('int_sqrt', 'int_sqrt(${1:n})', vscode.CompletionItemKind.Function, 'Math.int_sqrt (std/Math.yap)'));

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

  context.subscriptions.push(provider);
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
