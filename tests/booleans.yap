// Phase 4: Boolean support with logical operators

// Test boolean literals
print(true);
print(false);

// Test logical AND with short-circuit evaluation
var a = 1;
var b = 0;
print(a && b);          // Should be 0
print(1 && 1);          // Should be 1
print(0 && 1);          // Should be 0 (short-circuit)

// Test logical OR with short-circuit evaluation
print(a || b);          // Should be 1
print(0 || 0);          // Should be 0
print(1 || 0);          // Should be 1 (doesn't eval right side)

// Test NOT operator
print(!true);           // Should be 0
print(!false);          // Should be 1
print(!0);              // Should be 1
print(!1);              // Should be 0

// Test comparisons returning booleans
var x = 5;
var result = x > 3;
print(result);          // Should be 1

// Complex boolean expressions
print(3 < 5 && 10 > 2);     // Should be 1
print(1 == 1 || 2 == 3);    // Should be 1
print((5 > 10) && (20 < 30)); // Should be 0 (short-circuit)

// Boolean in if statements
if (true) {
    print(99);
}

if (1 && 1) {
    print(88);
}

if (0 || 1) {
    print(77);
}
