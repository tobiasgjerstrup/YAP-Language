// Debug: nested calls issue
fn add(a, b) {
    return a + b;
}

fn factorial(n) {
    if (n <= 1) {
        return 1;
    } else {
        return n * factorial(n - 1);
    }
}

// Test each component separately
print(factorial(3));
print(add(2, 3));
print(add(6, 5));

// Now test nested
var nested = add(factorial(3), add(2, 3));
print(nested);
