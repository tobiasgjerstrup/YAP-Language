// Phase 2 test: if/else, while loops, functions, returns, strings

// Test if/else
var x = 5;
if (x < 10) {
    print(1);
} else {
    print(0);
}

if (x > 10) {
    print(0);
} else {
    print(1);
}

// Test while loop
var i = 0;
while (i < 3) {
    print(i);
    i = i + 1;
}

// Test function definition and call
fn add(a, b) {
    return a + b;
}

var sum = add(5, 7);
print(sum);

// Test recursive function
fn factorial(n) {
    if (n <= 1) {
        return 1;
    } else {
        return n * factorial(n - 1);
    }
}

var fact = factorial(5);
print(fact);

// Test nested function calls
var nested = add(factorial(3), add(2, 3));
print(nested);

// Test string literals and concatenation
var greeting = "Hello";
print(greeting);

var world = " World";
var full = greeting + world;
print(full);

// Test complex control flow
var sum2 = 0;
var j = 1;
while (j <= 5) {
    if (j % 2 == 0) {
        sum2 = sum2 + j;
    }
    j = j + 1;
}
print(sum2);
