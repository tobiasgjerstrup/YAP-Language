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
        completions.push(createCompletion('if', 'if (${1:condition}) {\n\t${2:// code}\n}', vscode.CompletionItemKind.Keyword, 'If statement'));
        completions.push(createCompletion('else', 'else {\n\t${1:// code}\n}', vscode.CompletionItemKind.Keyword, 'Else statement'));
        completions.push(createCompletion('while', 'while (${1:condition}) {\n\t${2:// code}\n}', vscode.CompletionItemKind.Keyword, 'While loop'));
        completions.push(createCompletion('return', 'return ${1:value};', vscode.CompletionItemKind.Keyword, 'Return statement'));

        // Built-in functions
        completions.push(createCompletion('print', 'print(${1:value});', vscode.CompletionItemKind.Function, 'Print to console'));

        // Constants
        completions.push(createCompletion('true', 'true', vscode.CompletionItemKind.Constant, 'Boolean true'));
        completions.push(createCompletion('false', 'false', vscode.CompletionItemKind.Constant, 'Boolean false'));

        return completions;
      }
    },
    // Trigger on any letter (optional)
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'
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
