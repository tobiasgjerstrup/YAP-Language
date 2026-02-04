#ifndef AST_H
#define AST_H

typedef struct ASTNode ASTNode;

typedef enum {
    NODE_PROGRAM,
    NODE_VAR_DECL,
    NODE_FUNC_DECL,
    NODE_IF_STMT,
    NODE_WHILE_STMT,
    NODE_RETURN_STMT,
    NODE_PRINT_STMT,
    NODE_ASSIGNMENT,
    NODE_CALL,
    NODE_BINARY_OP,
    NODE_UNARY_OP,
    NODE_INT_LITERAL,
    NODE_STRING_LITERAL,
    NODE_BOOL_LITERAL,
    NODE_IDENTIFIER,
    NODE_BLOCK,
    NODE_ARRAY_LITERAL,
    NODE_ARRAY_INDEX
} NodeType;

typedef struct {
    char *name;
    ASTNode *value;
} VarDecl;

typedef struct {
    char *name;
    char **params;
    int param_count;
    ASTNode *body;
} FuncDecl;

typedef struct {
    ASTNode *condition;
    ASTNode *then_branch;
    ASTNode *else_branch;
} IfStmt;

typedef struct {
    ASTNode *condition;
    ASTNode *body;
} WhileStmt;

typedef struct {
    ASTNode *value;
} ReturnStmt;

typedef struct {
    ASTNode *value;
} PrintStmt;

typedef struct {
    char *name;
    ASTNode *value;
} Assignment;

typedef struct {
    char *name;
    ASTNode **args;
    int arg_count;
} Call;

typedef struct {
    ASTNode *left;
    ASTNode *right;
    char *op;
} BinaryOp;

typedef struct {
    ASTNode *operand;
    char *op;
} UnaryOp;

typedef struct {
    ASTNode **statements;
    int count;
} Block;

typedef struct {
    int value;
} IntLiteral;

typedef struct {
    char *value;
} StringLiteral;

typedef struct {
    int value; // 0 = false, 1 = true
} BoolLiteral;

typedef struct {
    char *name;
} Identifier;

typedef struct {
    ASTNode **elements;
    int element_count;
} ArrayLiteral;

typedef struct {
    ASTNode *array;
    ASTNode *index;
} ArrayIndex;

struct ASTNode {
    NodeType type;
    int line;
    int column;
    union {
        VarDecl var_decl;
        FuncDecl func_decl;
        IfStmt if_stmt;
        WhileStmt while_stmt;
        ReturnStmt return_stmt;
        PrintStmt print_stmt;
        Assignment assignment;
        Call call;
        BinaryOp binary_op;
        UnaryOp unary_op;
        Block block;
        IntLiteral int_literal;
        StringLiteral string_literal;
        BoolLiteral bool_literal;
        Identifier identifier;
        ArrayLiteral array_literal;
        ArrayIndex array_index;
    } data;
    ASTNode **statements; // for PROGRAM and BLOCK
    int statement_count;
};

ASTNode* ast_create_program(ASTNode **statements, int count);
ASTNode* ast_create_var_decl(const char *name, ASTNode *value);
ASTNode* ast_create_func_decl(const char *name, char **params, int param_count, ASTNode *body);
ASTNode* ast_create_if_stmt(ASTNode *condition, ASTNode *then_branch, ASTNode *else_branch);
ASTNode* ast_create_while_stmt(ASTNode *condition, ASTNode *body);
ASTNode* ast_create_return_stmt(ASTNode *value);
ASTNode* ast_create_print_stmt(ASTNode *value);
ASTNode* ast_create_assignment(const char *name, ASTNode *value);
ASTNode* ast_create_call(const char *name, ASTNode **args, int arg_count);
ASTNode* ast_create_binary_op(ASTNode *left, ASTNode *right, const char *op);
ASTNode* ast_create_unary_op(ASTNode *operand, const char *op);
ASTNode* ast_create_block(ASTNode **statements, int count);
ASTNode* ast_create_int_literal(int value);
ASTNode* ast_create_string_literal(const char *value);
ASTNode* ast_create_bool_literal(int value);
ASTNode* ast_create_identifier(const char *name);
ASTNode* ast_create_array_literal(ASTNode **elements, int count);
ASTNode* ast_create_array_index(ASTNode *array, ASTNode *index);
void ast_free(ASTNode *node);

#endif // AST_H
