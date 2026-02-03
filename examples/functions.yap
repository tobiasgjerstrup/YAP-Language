// Function definition
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

// Call functions
var result = add(5, 3);
print(result);

var fact = factorial(5);
print(fact);

// String concatenation
var name = "World";
var greeting = "Hello, " + name;
print(greeting);
