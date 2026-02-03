# YAP Language - Yet Another Programming Language

A simple yet functional programming language written in C that can be compiled and executed. YAP serves as an educational example of how to build a programming language from scratch.

## Project Structure

```
├── src/
│   ├── main.c           # Main entry point
│   ├── lexer.h/c        # Tokenization
│   ├── parser.h/c       # Parse tokens into AST
│   ├── ast.h/c          # Abstract Syntax Tree definitions
│   └── interpreter.h/c  # Execution engine
├── examples/            # Example YAP programs
├── Makefile            # Build configuration
└── README.md           # This file
```

## Features

YAP supports:
- **Variables**: `var x = 10;`
- **Data Types**: Integers, Strings, Booleans
- **Arithmetic**: `+`, `-`, `*`, `/`, `%`
- **Comparison**: `<`, `<=`, `>`, `>=`, `==`, `!=`
- **Logical Operations**: `&&`, `||`, `!`
- **Conditionals**: `if`/`else` statements
- **Loops**: `while` loops
- **Functions**: Function declarations with parameters and return values
- **Output**: `print()` function for console output
- **Comments**: `// Single line comments`
- **String Concatenation**: Using the `+` operator

## Building

### On Linux/macOS:

```bash
cd YAP-Language
make
```

This creates a `bin/yap` executable.

### On Windows (with GCC/MinGW):

```bash
cd YAP-Language
mingw32-make
```

## Usage

### Interactive Mode

Run without arguments for interactive mode:

```bash
./bin/yap
```

Then type YAP code directly:

```
> var x = 5;
> print(x);
5
>
```

### File Mode

Execute a YAP program from a file:

```bash
./bin/yap examples/basic.yap
```

## Language Syntax

### Variable Declaration

```
var variableName = value;
```

Example:
```
var x = 42;
var name = "Alice";
var flag = true;
```

Variables can be reassigned:
```
x = 100;
```

### Functions

Define functions with the `fn` keyword:

```
fn functionName(param1, param2) {
    return param1 + param2;
}
```

Example:
```
fn add(a, b) {
    return a + b;
}

var result = add(5, 3);
print(result);  // Output: 8
```

### Control Flow

#### If/Else

```
if (condition) {
    // code
} else {
    // code
}
```

Example:
```
var x = 10;
if (x > 5) {
    print("x is greater than 5");
} else {
    print("x is 5 or less");
}
```

#### While Loops

```
while (condition) {
    // code
}
```

Example:
```
var i = 0;
while (i < 5) {
    print(i);
    i = i + 1;
}
```

### Print Statement

Output values using `print()`:

```
print("Hello, World!");
print(42);
print(true);
```

### Comments

Single-line comments start with `//`:

```
// This is a comment
var x = 5;  // Initialize x
```

## Examples

### Basic Arithmetic

```
var x = 10;
var y = 20;
print(x + y);  // 30
print(x * y);  // 200
print(y - x);  // 10
print(y / x);  // 2
```

See [examples/basic.yap](examples/basic.yap)

### Functions and Recursion

```
fn factorial(n) {
    if (n <= 1) {
        return 1;
    } else {
        return n * factorial(n - 1);
    }
}

print(factorial(5));  // 120
```

See [examples/functions.yap](examples/functions.yap)

### String Operations

```
var greeting = "Hello" + " " + "World";
print(greeting);  // Hello World
```

## Implementation Details

### Lexer
Tokenizes the source code into a stream of tokens. Handles identifiers, keywords, literals, and operators.

### Parser
Builds an Abstract Syntax Tree (AST) from the token stream using recursive descent parsing. Implements operator precedence for correct expression evaluation.

### Interpreter
Executes the AST through tree-walking interpretation. Manages variable scopes, function definitions, and program state.

### Data Types

- **Integer (int)**: 32-bit signed integers
- **String**: Text strings with concatenation support
- **Boolean (bool)**: true/false values
- **Null**: Default uninitialized value

## Future Enhancements

Ideas for extending YAP:
- [ ] Arrays and data structures
- [ ] Classes/structs
- [ ] More built-in functions
- [ ] Error handling with try/catch
- [ ] For loops
- [ ] Switch statements
- [ ] Floating-point numbers
- [ ] File I/O
- [ ] Standard library
- [ ] Better error messages with line numbers

## License

This project is provided as-is for educational purposes.
