@echo off
setlocal enabledelayedexpansion

set CC=gcc
set CFLAGS=-Wall -std=c99 -g -Isrc
set SRCDIR=src
set OBJDIR=build
set BINDIR=bin

if not exist %OBJDIR% mkdir %OBJDIR%
if not exist %OBJDIR%\compiler mkdir %OBJDIR%\compiler
if not exist %OBJDIR%\runtime mkdir %OBJDIR%\runtime
if not exist %BINDIR% mkdir %BINDIR%

echo Compiling...
%CC% %CFLAGS% -c %SRCDIR%\main.c -o %OBJDIR%\main.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\lexer.c -o %OBJDIR%\lexer.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\parser.c -o %OBJDIR%\parser.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\ast.c -o %OBJDIR%\ast.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\compiler.c -o %OBJDIR%\compiler\compiler.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\codegen_ctx.c -o %OBJDIR%\compiler\codegen_ctx.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\analysis.c -o %OBJDIR%\compiler\analysis.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\emit_expr.c -o %OBJDIR%\compiler\emit_expr.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\emit_stmt.c -o %OBJDIR%\compiler\emit_stmt.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler\emit_runtime.c -o %OBJDIR%\compiler\emit_runtime.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\runtime\interpreter.c -o %OBJDIR%\runtime\interpreter.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\runtime\eval.c -o %OBJDIR%\runtime\eval.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\runtime\value.c -o %OBJDIR%\runtime\value.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\runtime\io.c -o %OBJDIR%\runtime\io.o
if errorlevel 1 goto error

echo Linking...
%CC% %CFLAGS% %OBJDIR%\main.o %OBJDIR%\lexer.o %OBJDIR%\parser.o %OBJDIR%\ast.o %OBJDIR%\compiler\compiler.o %OBJDIR%\compiler\codegen_ctx.o %OBJDIR%\compiler\analysis.o %OBJDIR%\compiler\emit_expr.o %OBJDIR%\compiler\emit_stmt.o %OBJDIR%\compiler\emit_runtime.o %OBJDIR%\runtime\interpreter.o %OBJDIR%\runtime\eval.o %OBJDIR%\runtime\value.o %OBJDIR%\runtime\io.o -o %BINDIR%\yap.exe
if errorlevel 1 goto error

echo Build complete: %BINDIR%\yap.exe
goto end

:error
echo Build failed!
exit /b 1

:end
