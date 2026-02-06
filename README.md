# YAP Language - Yet Another Programming Language

YAP is a small programming language written in C with both an interpreter and a native compiler. It is designed as an educational project, but it supports a practical set of features including arrays, imports, exceptions, and file IO.

## Project Layout

```
├── src/
│   ├── main.c                    # CLI entry, interpreter, compiler front door
│   ├── lexer.h/c                 # Tokenization
│   ├── parser.h/c                # Recursive descent parser
│   ├── ast.h/c                   # AST nodes
│   ├── compiler/                 # Native codegen (x86_64)
│   │   ├── compiler.h/c           # Compile entry + driver
│   │   ├── analysis.h/c           # Semantic analysis and type inference
│   │   ├── codegen_ctx.h/c        # Codegen state and helpers
│   │   ├── emit.h                 # Codegen interface
│   │   ├── emit_expr.c            # Expression emission
│   │   ├── emit_stmt.c            # Statement emission
│   │   └── emit_runtime.h/c       # Runtime stubs for compiled output
│   └── runtime/                  # Interpreter runtime + built-ins
│       ├── interpreter.h/c        # Tree-walk interpreter
│       ├── interpreter_internal.h # Internal interpreter helpers
│       ├── eval.h/c               # Expression evaluation
│       ├── io.h/c                 # File IO built-ins
│       └── value.h/c              # Runtime value system
├── std/                          # Standard library in YAP (e.g. Math.yap)
├── tests/                        # Feature tests and helpers
├── bin/                          # Built output
├── build.bat / Makefile          # Build scripts
└── yap-language-extension/       # VS Code syntax highlighting
```

## Build

### Linux/macOS

```bash
make
```

### Windows (MinGW)

```bash
build.bat
```

Build output is [bin/yap](bin/yap) (or [bin/yap.exe](bin/yap.exe) on Windows).

## Run

### Interactive REPL

```bash
./bin/yap
```

### Run a file

```bash
./bin/yap ./tests/basic.yap
```

### Pass program arguments

```bash
./bin/yap ./tests/full_test.yap hello world interpreted
```

In YAP, `args` is an array of the extra CLI arguments (strings).

## Compile (native)

Native compilation generates x86_64 assembly and links it with `gcc`.

```bash
./bin/yap --compile ./tests/full_test.yap -o full_test.out
./full_test.out hello world compiled
```

Notes:
- Compile mode uses `gcc` to link.
- Compile mode is not supported on Windows yet.

## Language Features

Core syntax:
- Variables with `var`
- Integers, strings, booleans, null
- Arithmetic and comparisons
- `if` / `else`, `while`
- Functions with `fn` and `return`
- Arrays and indexing: `[1, 2, 3]`, `arr[0]`
- Imports and exports
- Exceptions: `try` / `catch` / `finally`, `throw`

Built-ins:
- `print(value)`
- `read(filename)`, `write(filename, content)`, `append(filename, content)`
- `push(array, value)`, `pop(array)`
- `random()`, `timestamp()`

Example (imports + stdlib):

```
import { abs, pow, gcd } from "std/Math";

print(abs(-10));
print(pow(2, 8));
print(gcd(54, 24));
```

## Standard Library

The standard library lives under [std/](std/), currently with math helpers in [std/Math.yap](std/Math.yap).

Import paths can be:
- `std/Math` (stdlib)
- Relative paths like `tests/math_utils.yap`

To override stdlib resolution, set `YAP_STD_PATH` to a folder containing std modules.

## Tests

### Linux/macOS

```bash
./tests/run.bash
```

### Windows (PowerShell)

```powershell
./tests/run.ps1
```

The full language smoke test is [tests/full_test.yap](tests/full_test.yap).

## Editor Support

VS Code syntax highlighting lives in [yap-language-extension/](yap-language-extension/). You can open that folder and package it as an extension or load it as an unpacked extension.

## License

This project is provided as-is for educational purposes.
