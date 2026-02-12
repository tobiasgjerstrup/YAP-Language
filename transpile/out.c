#include <stdio.h>

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
    return 0;
}
