export fn add(a, b) {
    return a + b;
}

export fn multiply(a, b) {
    return a * b;
}

fn private_helper(x) {
    return x * 2;
}

export fn square(x) {
    return multiply(x, x);
}
