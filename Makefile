CC = gcc
CFLAGS = -Wall -std=c99 -g
SRCDIR = src
OBJDIR = build
BINDIR = bin

SOURCES = $(SRCDIR)/main.c $(SRCDIR)/lexer.c $(SRCDIR)/parser.c $(SRCDIR)/ast.c $(SRCDIR)/interpreter.c
OBJECTS = $(OBJDIR)/main.o $(OBJDIR)/lexer.o $(OBJDIR)/parser.o $(OBJDIR)/ast.o $(OBJDIR)/interpreter.o
EXECUTABLE = $(BINDIR)/yap

all: $(EXECUTABLE)

$(EXECUTABLE): $(OBJECTS)
	@mkdir -p $(BINDIR)
	$(CC) $(CFLAGS) $(OBJECTS) -o $@
	@echo "Build complete: $(EXECUTABLE)"

$(OBJDIR)/%.o: $(SRCDIR)/%.c
	@mkdir -p $(OBJDIR)
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -rf $(OBJDIR) $(BINDIR)

run: $(EXECUTABLE)
	./$(EXECUTABLE)

.PHONY: all clean run
