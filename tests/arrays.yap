// Phase 5: Array support

// Basic array literal
var arr = [10, 20, 30];
print(arr[0]);
print(arr[1]);
print(arr[2]);

// Array with expressions
var x = 5;
var arr2 = [x, x + 1, x * 2];
print(arr2[0]);
print(arr2[1]);
print(arr2[2]);

// Array indexing with expressions
var idx = 1;
print(arr[idx]);

// Array in a loop
var i = 0;
while (i < 3) {
    print(arr[i]);
    i = i + 1;
}
