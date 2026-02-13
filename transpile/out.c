#include <stdio.h>

int YAP_STD_pow(int base, int exp) {
if (exp < 0) {
return 0;
}
int result = 1;
int i = 0;
while (i < exp) {
result = result * base;
i = i + 1;
}
return result;
}
int YAP_STD_abs(int x) {
if (x < 0) {
return /* unsupported expr */;
}
return x;
}
const char* exportedFunction() {
return "exported value!";
}
void returnVoid() {
printf("%s\n", "hello there!");
}
const char* returnString() {
return "crazy string!";
}
int returnInt() {
return 0;
}
int main() {
printf("%s\n", "hello world");
printf("%d\n", 69);
int x = 10;
const char *hello = "hello";
printf("%d\n", x);
printf("%s\n", hello);
hello = "world!";
printf("%s\n", hello);
x = 20;
int y = 5;
printf("%d\n", x);
if (x > y) {
printf("%s\n", "x is greater than y");
if (x == 20) {
printf("%s\n", "x is 20");
if (x > 30) {
printf("%s\n", "x is less than 30");
}
else {
printf("%s\n", "x is not less than 30");
}
}
else {
printf("%s\n", "x is not 20");
}
}
else {
printf("%s\n", "x is not greater than y");
}
int longLoop = 2147483647;
printf("%d\n", longLoop);
while (longLoop > 0) {
longLoop = longLoop - 1;
if (longLoop % 100000000 == 0) {
printf("%d\n", longLoop);
}
}
returnVoid();
printf("%s\n", returnString());
printf("%d\n", returnInt());
printf("%s\n", exportedFunction());
printf("%d\n", YAP_STD_pow(2, 8));
printf("%d\n", YAP_STD_abs(10));
    return 0;
}
