#include <stdio.h>

const char* exportedFunctionUwU() {
return "exported value!";
}
const char* exportedFunction() {
return "exported value!";
}
void returnVoid() {
printf("%s\n", "helloo there!");
}
const char* returnString() {
return "crazy string!";
}
int returnInt() {
return 0;
}
int main() {
printf("%s\n", "helloo world");
printf("%d\n", 69);
int x = 10;
const char *helloo = "helloo";
printf("%d\n", x);
printf("%s\n", helloo);
helloo = "world!";
printf("%s\n", helloo);
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
    return 0;
}
