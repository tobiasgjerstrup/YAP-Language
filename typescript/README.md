# YAP Language

YAP is a small language that currently transpiles to C. This document describes the features that are implemented in the TypeScript compiler in this repository today.

## Toolchain

Build the compiler:

```bash
npm run build
```

Transpile a YAP file to C:

```bash
npm run start examples/hello.yap examples/output.c
```

Run the full sample pipeline used by this repository:

```bash
npm run full
```

Command-line usage:

```text
node dist/index.js <input.yap> [output.c]
```

If no output path is provided, the compiler writes a `.c` file next to the input name.

## Source File Features

### Imports

YAP supports top-level string-based imports:

```yap
import "./math.yap"
import "./strings.yap";
```

- Imports must appear as string literals.
- A trailing semicolon is optional.
- Import paths are resolved relative to the file that contains the import.
- If the path does not end in `.yap`, the compiler also tries the same path with `.yap` appended.
- Circular imports are rejected.

Imported files contribute their functions to the final program.

### Comments

YAP currently supports line comments only:

```yap
// this is a comment
let x int32 = 10 // this is also a comment
```

Block comments are not implemented.

### Optional Semicolons

Semicolons are optional after statements and imports:

```yap
let x int32 = 1;
let y int32 = 2
print(x + y);
```

## Types

The transpiler currently supports these base types:

- `int32`
- `int64`
- `string`

These map to C as follows:

- `int32` -> `int32_t`
- `int64` -> `int64_t`
- `string` -> `char*`

Any other type name is rejected during code generation.

### Fixed-Size Arrays

YAP supports fixed-size arrays using `Type[size]` syntax:

```yap
let values int32[4] = 0
let names string[2] = ["Ada", "Grace"]
```

Function return types can also be fixed-size arrays:

```yap
fn first_three() int32[3] {
    return [1, 2, 3]
}
```

Notes:

- Array sizes must be numeric literals.
- Arrays are fixed-size. Dynamic arrays are not implemented.
- `.length` is supported for fixed-size arrays.

## Functions

Functions are declared with `fn`:

```yap
fn add(a int32, b int32) int32 {
    return a + b
}
```

### Function Features

- Named parameters with explicit types.
- Zero or more parameters.
- Explicit return types for non-`main` functions.
- Function calls with zero or more arguments.
- Recursion.

Examples:

```yap
fn greet() string {
    return "Hello"
}

fn factorial(n int32) int32 {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}
```

### `main`

`main` is special:

```yap
fn main() {
    print("Hello, World!")
}
```

- `main` may omit its return type.
- When omitted, `main` defaults to `int32`.
- Generated C always emits `int main(void)` and returns `0` at the end.

In practice, `main` should be written without parameters.

## Statements

### Variable Declarations

Variables are declared with `let` and always require an explicit type and initializer:

```yap
let x int32 = 5
let title string = "YAP"
let items int32[4] = 0
```

Features:

- No type inference.
- No uninitialized declarations.
- Fixed-size array declarations are supported.

### Assignment

Simple assignment is supported:

```yap
x = x + 1
```

Indexed assignment is also supported:

```yap
items[2] = 99
grid[i][j] = 1
```

### `return`

Functions return values with `return`:

```yap
return x
return "done"
return [1, 2, 3]
```

Returning fixed-size array literals is supported when the function return type is also a fixed-size array.

### `print`

YAP includes a built-in `print` statement:

```yap
print(42)
print("hello")
print(name)
print(values[0])
```

Behavior:

- Prints numbers with a trailing newline.
- Prints strings with a trailing newline.
- Printing string-returning function calls is supported.
- Printing indexed string array values is supported.

### `if` / `else`

Conditional statements use braces around blocks:

```yap
if x > 0 {
    print("positive")
} else {
    print("zero or negative")
}
```

Features:

- `if` without `else` is supported.
- `if` with `else` is supported.
- `else if` is not a dedicated syntax form. Use nested `if` inside `else` if needed.

### `while`

Looping is provided by `while`:

```yap
while x > 0 {
    x = x - 1
}
```

`for` loops are not implemented.

### Expression Statements

A bare expression can be used as a statement, which is mainly useful for function calls:

```yap
tick()
log_value(x)
```

## Expressions

### Literals

Supported literals:

```yap
123
"hello"
[1, 2, 3]
```

Literal support includes:

- Integer number literals.
- String literals.
- Array literals.

String literals support escaped double quotes:

```yap
"say \"hi\""
```

### Identifiers

Identifiers may contain letters, digits, and underscores, and may start with a letter or underscore:

```yap
myVar
_temporary
name_2
```

### Binary Operators

These binary operators are implemented:

- `+`
- `-`
- `*`
- `/`
- `==`
- `!=`
- `<`
- `>`
- `<=`
- `>=`

Examples:

```yap
a + b
x * y
n <= 1
score != 0
```

### Unary Minus

Unary minus is supported:

```yap
-5
-(x)
```

### Operator Precedence

Expression precedence is:

1. Postfix operations: function call, indexing, `.length`
2. Unary minus
3. `*` and `/`
4. `+` and `-`
5. `==`, `!=`, `<`, `>`, `<=`, `>=`

Binary operators associate left-to-right.

Examples:

```yap
1 + 2 * 3      // parsed as 1 + (2 * 3)
1 + 2 + 3      // parsed as (1 + 2) + 3
```

### Parentheses

Parentheses can group expressions:

```yap
(a + b) * c
```

### Function Calls

Function calls are expressions:

```yap
greet()
add(1, 2)
mix(a, b, c)
```

Only identifiers can be called directly. Calling the result of another expression is not implemented.

### Array Indexing

Array indexing is supported and can be chained:

```yap
values[0]
grid[i][j]
return_big_array()[5]
```

### Array Literals

Array literals are supported:

```yap
[1, 2, 3]
[]
```

They are used in array declarations and array returns.

### Array Length

Fixed-size arrays expose a `.length` property:

```yap
values.length
return_big_array().length
```

Current limitations:

- Only `.length` is supported as a property.
- Other properties such as `.size` are rejected.
- `.length` is resolved from the fixed array size known at compile time.

## Array Semantics

YAP's array support is intentionally simple.

### Local Fixed-Size Arrays

Local arrays can be initialized from:

- A scalar value, which becomes a C initializer such as `{0}`.
- An array literal.
- A function call returning a fixed-size array of the same base type and size.
- Another array-typed expression whose fixed size can be resolved by the transpiler.

Example:

```yap
fn nums() int32[3] {
    return [10, 20, 30]
}

fn main() {
    let local int32[3] = nums()
    print(local[1])
}
```

If the source and destination array sizes differ, code generation fails.

### Returning Arrays

Functions can return fixed-size arrays. The C backend implements this by returning a pointer to a static buffer for that function.

That means YAP currently supports array returns, but the implementation is designed around transpilation convenience rather than value semantics.

## Grammar Sketch

This is a practical sketch of the implemented syntax:

```text
program     := import* fn*
import      := "import" STRING ";"?
fn          := "fn" IDENT "(" params? ")" returnType? block
params      := param ("," param)*
param       := IDENT IDENT
returnType  := IDENT ("[" NUMBER "]")?
block       := "{" stmt* "}"

stmt        := letDecl
             | returnStmt
             | printStmt
             | ifStmt
             | whileStmt
             | assignment
             | exprStmt

letDecl     := "let" IDENT IDENT ("[" NUMBER "]")? "=" expr
returnStmt  := "return" expr
printStmt   := "print" "(" expr ")"
ifStmt      := "if" expr block ("else" block)?
whileStmt   := "while" expr block
assignment  := IDENT "=" expr
             | postfix "[" expr "]" "=" expr
exprStmt    := expr

expr        := comparison
comparison  := addSub (("==" | "!=" | "<" | ">" | "<=" | ">=") addSub)*
addSub      := mulDiv (("+" | "-") mulDiv)*
mulDiv      := unary (("*" | "/") unary)*
unary       := "-" primary | primary
primary     := NUMBER
             | STRING
             | IDENT
             | arrayLiteral
             | "(" expr ")"
postfix     := primary (call | index | length)*
call        := "(" args? ")"
index       := "[" expr "]"
length      := "." "length"
arrayLiteral:= "[" (expr ("," expr)*)? "]"
args        := expr ("," expr)*
```

## Current Limits

The following are not implemented in the current compiler:

- `bool`, `float`, or custom user-defined types.
- Dynamic arrays.
- Structs, enums, classes, or methods.
- `for` loops.
- `break` and `continue`.
- Logical operators such as `&&`, `||`, and `!`.
- Modulo `%`.
- Compound assignment such as `+=`.
- Dedicated `else if` syntax.
- Property access other than `.length`.
- Block comments.
- Type inference.
- Lambdas or anonymous functions.

## Example

```yap
import "evening.yap"

fn add(a int32, b int32) int32 {
    return a + b
}

fn factorial(n int32) int32 {
    if n <= 1 {
        return 1
    }
    return n * factorial(n - 1)
}

fn return_big_array() int32[10] {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
}

fn main() {
    let x int32 = 10
    let y int32 = 20
    let sum int32 = add(x, y)
    print(sum)

    let i int32 = 5
    print(factorial(i))

    let values int32[10] = return_big_array()
    print(values.length)
    print(values[3])

    while x > 0 {
        x = x - 3
    }

    if x == 0 {
        print("zero")
    } else {
        print("negative")
    }
}
```