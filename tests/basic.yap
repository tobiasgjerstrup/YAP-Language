// Comprehensive YAP test: phase 1 features only

// Basic arithmetic
var a = 10;
var b = 3;
print(a + b);
print(a - b);
print(a * b);
print(a / b);
print(a % b);

// Comparisons (results are 0/1)
print(a < b);
print(a <= b);
print(a > b);
print(a >= b);
print(a == b);
print(a != b);

// Unary operators
print(-a);
print(!0);
print(!1);

// Variable reassignment
var c = 0;
print(c);
c = a + b * 2;
print(c);

// No strings, control flow, or functions in phase 1
