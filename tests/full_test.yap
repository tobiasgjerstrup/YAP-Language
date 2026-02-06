// Full feature test for YAP language with pass/fail tracking

import { add, multiply, square } from "tests/math_utils.yap";
import { get_line, save_result } from "tests/file_utils.yap";
import { abs, sign, max, min, clamp, is_even, is_odd, pow, gcd, lcm, factorial, int_sqrt } from "std/Math";

var pass = 0;
var fail = 0;
var ok = 0;

fn check(ok, label) {
    if (ok) {
        return 1;
    }

    print("FAIL: " + label);
    return 0;
}

fn assert_true(cond, label) {
    return check(cond, label);
}

fn assert_eq_int(actual, expected, label) {
    return check(actual == expected, label);
}

fn assert_neq_int(actual, expected, label) {
    return check(actual != expected, label);
}

fn assert_eq_str(actual, expected, label) {
    return check(actual == expected, label);
}

// Variables and types
var x = 10;
var y = 3;
var name = "YAP";
var flag = true;
ok = assert_eq_int(x, 10, "var x");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_str(name, "YAP", "var name");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(flag, "var flag");
pass = pass + ok;
fail = fail + (1 - ok);

// Arithmetic and assignment
var z = x + y * 2 - 1;
ok = assert_eq_int(z, 15, "arithmetic precedence");
pass = pass + ok;
fail = fail + (1 - ok);
z = z / y;
ok = assert_eq_int(z, 5, "division");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(x % y, 1, "modulo");
pass = pass + ok;
fail = fail + (1 - ok);

// Comparisons and logical operators
ok = assert_true(x > y, "comparison greater");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(!(x <= y), "comparison less-equal");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(x == 10, "comparison equal");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(x != y, "comparison not-equal");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(!(flag && false), "logical and");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(flag || false, "logical or");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(!flag == false, "logical not");
pass = pass + ok;
fail = fail + (1 - ok);

// If/else
var relation = "";
if (x > y) {
    relation = "x > y";
}
else {
    relation = "x <= y";
}
ok = assert_eq_str(relation, "x > y", "if/else branch");
pass = pass + ok;
fail = fail + (1 - ok);

// While loop
var i = 0;
var sum = 0;
while (i < 5) {
    sum = sum + i;
    i = i + 1;
}
ok = assert_eq_int(sum, 10, "while loop sum");
pass = pass + ok;
fail = fail + (1 - ok);

// Functions and return values
fn add3(a, b, c) {
    return a + b + c;
}

ok = assert_eq_int(add3(1, 2, 3), 6, "function add3");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(add(5, 7), 12, "imported add");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(multiply(4, 6), 24, "imported multiply");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(square(9), 81, "imported square");
pass = pass + ok;
fail = fail + (1 - ok);

// Strings and concatenation
var greeting = "Hello" + " " + name;
ok = assert_eq_str(greeting, "Hello YAP", "string concat");
pass = pass + ok;
fail = fail + (1 - ok);
var result_str = "result=" + z;
ok = assert_eq_str(result_str, "result=5", "string concat with int");
pass = pass + ok;
fail = fail + (1 - ok);

// Arrays, indexing, and push/pop
var arr = [1, 2, 3];
ok = assert_eq_int(arr[0], 1, "array index 0");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(arr[1], 2, "array index 1");
pass = pass + ok;
fail = fail + (1 - ok);
var idx = 2;
ok = assert_eq_int(arr[idx], 3, "array index expr");
pass = pass + ok;
fail = fail + (1 - ok);
arr = push(arr, 4);
ok = assert_eq_int(arr[3], 4, "array push");
pass = pass + ok;
fail = fail + (1 - ok);
var popped = pop(arr);
ok = assert_eq_int(popped, 4, "array pop");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(arr[2], 3, "array after pop");
pass = pass + ok;
fail = fail + (1 - ok);

// Array with expressions
var arr2 = [x, x + 1, x * 2];
ok = assert_eq_int(arr2[0], 10, "array expr 0");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(arr2[1], 11, "array expr 1");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(arr2[2], 20, "array expr 2");
pass = pass + ok;
fail = fail + (1 - ok);

// File I/O
var filename = "full_test_output.txt";
write(filename, "line1");
append(filename, "|line2");
ok = assert_eq_str(read(filename), "line1|line2", "file read after append");
pass = pass + ok;
fail = fail + (1 - ok);
save_result(filename, "saved");
ok = assert_eq_str(get_line(filename), "saved", "file read after save");
pass = pass + ok;
fail = fail + (1 - ok);

// Standard library (std/Math)
ok = assert_eq_int(abs(-5), 5, "math abs");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(sign(-7), -1, "math sign");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(max(3, 9), 9, "math max");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(min(3, 9), 3, "math min");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(clamp(5, 1, 4), 4, "math clamp");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(is_even(10), "math is_even");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_true(is_odd(7), "math is_odd");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(pow(2, 8), 256, "math pow");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(gcd(54, 24), 6, "math gcd");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(lcm(6, 8), 24, "math lcm");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(factorial(5), 120, "math factorial");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_int(int_sqrt(26), 5, "math int_sqrt");
pass = pass + ok;
fail = fail + (1 - ok);

// Built-in random and timestamp
var r = random();
ok = assert_true(r >= 0, "random non-negative");
pass = pass + ok;
fail = fail + (1 - ok);
var t = timestamp();
ok = assert_true(t > 0, "timestamp positive");
pass = pass + ok;
fail = fail + (1 - ok);

// Program arguments (run with: <file> hello world)
ok = assert_eq_str(args[0], "hello", "args[0]");
pass = pass + ok;
fail = fail + (1 - ok);
ok = assert_eq_str(args[1], "world", "args[1]");
pass = pass + ok;
fail = fail + (1 - ok);

var mode = "compiled";
if (args > 2) {
    mode = args[2];
}

// random & timestamp.
ok = assert_neq_int(random(), random(), "random different");
pass = pass + ok;
fail = fail + (1 - ok);

fn fnThatThrows() {
    throw "boom function!";
}

try {
    throw "boom";
    fail = fail + 1; // Should not reach here
} catch (e) {
    ok = assert_eq_str(e, "boom", "catch exception");
    pass = pass + ok;
} finally {
    print("cleanup");
}

try {
    fnThatThrows();
    fail = fail + 1; // Should not reach here
} catch (e) {
    ok = assert_eq_str(e, "boom function!", "catch exception from function");
    pass = pass + ok;
} finally {
    print("cleanup after function");
}

print("Passed: " + pass);
print("Failed: " + fail);

var longLoopStart = timestamp();
var longLoop = 2147483647;
if (mode == "interpreted") {
    longLoop = longLoop/50; // Shorten loop for interpret mode to avoid long test times
}
print(longLoop);
while (longLoop > 0) {
    longLoop = longLoop - 1;
    // if (longLoop % 100000000 == 0 || mode == "interpreted" && longLoop % 2000000 == 0) {
        //     print(longLoop);
        // }
    }
    var longLoopEnd = timestamp();
    var longLoopTime = longLoopEnd - longLoopStart;
    if (mode == "interpreted") {
        longLoopTime = longLoopTime * 50; // Scale time back up for interpret mode
    }
    print("Long loop time (seconds): " + longLoopTime + " in " + mode + " mode");