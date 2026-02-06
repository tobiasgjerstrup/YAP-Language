CC = gcc
CFLAGS = -Wall -std=c99 -g -Isrc
SRCDIR = src
OBJDIR = build
BINDIR = bin

SOURCES = $(SRCDIR)/main.c \
	$(SRCDIR)/lexer.c \
	$(SRCDIR)/parser.c \
	$(SRCDIR)/ast.c \
	$(SRCDIR)/compiler/compiler.c \
	$(SRCDIR)/compiler/codegen_ctx.c \
	$(SRCDIR)/compiler/analysis.c \
	$(SRCDIR)/compiler/emit_expr.c \
	$(SRCDIR)/compiler/emit_stmt.c \
	$(SRCDIR)/compiler/emit_runtime.c \
	$(SRCDIR)/runtime/interpreter.c \
	$(SRCDIR)/runtime/eval.c \
	$(SRCDIR)/runtime/value.c \
	$(SRCDIR)/runtime/io.c \
	$(SRCDIR)/runtime/sqlite.c
OBJECTS = $(patsubst $(SRCDIR)/%.c,$(OBJDIR)/%.o,$(SOURCES))
EXECUTABLE = $(BINDIR)/yap

all: $(EXECUTABLE)


$(EXECUTABLE): $(OBJECTS)
	@mkdir -p $(BINDIR)
	$(CC) $(CFLAGS) $(OBJECTS) -lsqlite3 -o $@
	@echo "Build complete: $(EXECUTABLE)"

$(OBJDIR)/%.o: $(SRCDIR)/%.c
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -rf $(OBJDIR) $(BINDIR)

run: $(EXECUTABLE)
	./$(EXECUTABLE)

.PHONY: all clean run
