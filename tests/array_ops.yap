// Phase 5b: Array push/pop operations

// Start with an array
var arr = [10, 20, 30];

// Print original
print(arr[0]);
print(arr[1]);
print(arr[2]);

// Push a new element - must reassign since realloc may return new pointer
arr = push(arr, 40);
print(arr[0]);
print(arr[1]);
print(arr[2]);
print(arr[3]);

// Pop an element - returns the value
var popped = pop(arr);
print(popped);

// Array is now shorter
print(arr[0]);
print(arr[1]);
print(arr[2]);

// Push multiple times
arr = push(arr, 50);
print(arr[3]);

arr = push(arr, 60);
print(arr[4]);
