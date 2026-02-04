@echo off
setlocal enabledelayedexpansion

set CC=gcc
set CFLAGS=-Wall -std=c99 -g
set SRCDIR=src
set OBJDIR=build
set BINDIR=bin

if not exist %OBJDIR% mkdir %OBJDIR%
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
%CC% %CFLAGS% -c %SRCDIR%\interpreter.c -o %OBJDIR%\interpreter.o
if errorlevel 1 goto error
%CC% %CFLAGS% -c %SRCDIR%\compiler.c -o %OBJDIR%\compiler.o
if errorlevel 1 goto error

echo Linking...
%CC% %CFLAGS% %OBJDIR%\main.o %OBJDIR%\lexer.o %OBJDIR%\parser.o %OBJDIR%\ast.o %OBJDIR%\interpreter.o %OBJDIR%\compiler.o -o %BINDIR%\yap.exe
if errorlevel 1 goto error

echo Build complete: %BINDIR%\yap.exe
goto end

:error
echo Build failed!
exit /b 1

:end
