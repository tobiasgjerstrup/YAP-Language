import * as vscode from 'vscode';

export type CompletionEntry = {
  label: string;
  insertText: string;
  kind: vscode.CompletionItemKind;
  documentation: string;
};

export const BASIC_COMPLETION_ENTRIES: CompletionEntry[] = [
  // Language keywords and declarations
  { label: 'let', insertText: 'let ${1:name} ${2:int32} = ${3:value}', kind: vscode.CompletionItemKind.Keyword, documentation: 'Variable declaration with explicit type' },
  { label: 'type', insertText: 'type ${1:Name} = { ${2:field}: ${3:int32} }', kind: vscode.CompletionItemKind.Keyword, documentation: 'Object type declaration' },
  { label: 'fn', insertText: 'fn ${1:name}(${2:param} ${3:int32}) ${4:int32} {\n\t${5:// body}\n}', kind: vscode.CompletionItemKind.Keyword, documentation: 'Function declaration' },
  { label: 'main', insertText: 'fn main() {\n\t${1:// body}\n}', kind: vscode.CompletionItemKind.Snippet, documentation: 'main function (return type omitted defaults to int32)' },
  { label: 'if', insertText: 'if ${1:condition} {\n\t${2:// code}\n}', kind: vscode.CompletionItemKind.Keyword, documentation: 'If statement' },
  { label: 'else', insertText: 'else {\n\t${1:// code}\n}', kind: vscode.CompletionItemKind.Keyword, documentation: 'Else block' },
  { label: 'while', insertText: 'while ${1:condition} {\n\t${2:// code}\n}', kind: vscode.CompletionItemKind.Keyword, documentation: 'While loop' },
  { label: 'return', insertText: 'return ${1:value}', kind: vscode.CompletionItemKind.Keyword, documentation: 'Return statement' },
  { label: 'import', insertText: 'import "${1:./file.yap}"', kind: vscode.CompletionItemKind.Keyword, documentation: 'Top-level string import' },
  { label: 'print', insertText: 'print(${1:value})', kind: vscode.CompletionItemKind.Keyword, documentation: 'Print statement' },

  // Built-in callable functions
  { label: 'read', insertText: 'read("${1:path}")', kind: vscode.CompletionItemKind.Function, documentation: 'Read file contents (string)' },
  { label: 'write', insertText: 'write("${1:path}", ${2:content})', kind: vscode.CompletionItemKind.Function, documentation: 'Write file contents (returns int32 status)' },

  // Array member operations
  { label: 'push', insertText: '${1:array}.push(${2:value})', kind: vscode.CompletionItemKind.Method, documentation: 'Push to a dynamic array (returns int32)' },
  { label: 'pop', insertText: '${1:array}.pop()', kind: vscode.CompletionItemKind.Method, documentation: 'Pop from a dynamic array (returns element type)' },
  { label: 'length', insertText: '${1:array}.length', kind: vscode.CompletionItemKind.Property, documentation: 'Array length property (int32)' },

  // Core scalar and type literals
  { label: 'true', insertText: 'true', kind: vscode.CompletionItemKind.Constant, documentation: 'Boolean true literal' },
  { label: 'false', insertText: 'false', kind: vscode.CompletionItemKind.Constant, documentation: 'Boolean false literal' },
  { label: 'int32', insertText: 'int32', kind: vscode.CompletionItemKind.TypeParameter, documentation: '32-bit integer type' },
  { label: 'int64', insertText: 'int64', kind: vscode.CompletionItemKind.TypeParameter, documentation: '64-bit integer type' },
  { label: 'string', insertText: 'string', kind: vscode.CompletionItemKind.TypeParameter, documentation: 'String type' },
  { label: 'boolean', insertText: 'boolean', kind: vscode.CompletionItemKind.TypeParameter, documentation: 'Boolean type' }
];

export const BUILTIN_DOCS: Record<string, string> = {
  let: '**let**\n\nDeclares a variable.\n\n`let name type = value`',
  type: '**type**\n\nDeclares an object type.\n\n`type User = { name: string }`',
  fn: '**fn**\n\nDeclares a function.\n\n`fn add(a int32, b int32) int32 { return a + b }`',
  main: '**main**\n\nSpecial entry function. Return type may be omitted and defaults to `int32`.\n\n`fn main() { print("hello") }`',
  if: '**if**\n\nConditional statement.\n\n`if cond { ... } else { ... }`',
  else: '**else**\n\nAlternative branch for `if`.\n\n`else { ... }`',
  while: '**while**\n\nLoop statement.\n\n`while cond { ... }`',
  return: '**return**\n\nReturns a value from a function.\n\n`return expr`',
  import: '**import**\n\nTop-level string import.\n\n`import "./module.yap"`',
  print: '**print**\n\nBuilt-in print statement.\n\n`print(value)`',
  read: '**read**\n\nReads a file and returns its contents as a string.\n\n`read("path")`',
  write: '**write**\n\nWrites content to a file. Returns `int32` status.\n\n`write("path", content)`',
  push: '**.push**\n\nDynamic-array method that appends one value.\n\n`arr.push(value)`',
  pop: '**.pop**\n\nDynamic-array method that removes and returns the last value.\n\n`arr.pop()`',
  length: '**.length**\n\nArray length property.\n\n`arr.length`',
  int32: '**int32**\n\n32-bit integer type.',
  int64: '**int64**\n\n64-bit integer type.',
  string: '**string**\n\nString type.',
  boolean: '**boolean**\n\nBoolean type.',
  true: '**true**\n\nBoolean true literal.',
  false: '**false**\n\nBoolean false literal.'
};
