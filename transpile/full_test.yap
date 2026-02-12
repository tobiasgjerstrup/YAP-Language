print("hello world");
print(69);

var x = 10;
var hello = "hello";
print(x);
print(hello);
hello = "world!";
print(hello);
var x = 20;
var y = 5;
print(x);

if (x > y) {
    print("x is greater than y");
    if (x == 20) {
        print("x is 20");
        if (x > 30) {
            print("x is less than 30");
        }
        else {
            print("x is not less than 30");
        }
    }
    else {
        print("x is not 20");
    }
}
else {
    print("x is not greater than y");
}

// if (true) {
// var longLoopStart = timestamp();
var longLoop = 2147483647;
print(longLoop);
while (longLoop > 0) {
    longLoop = longLoop - 1;
    if (longLoop % 100000000 == 0) {
        print(longLoop);
    }
}
// var longLoopEnd = timestamp();
// var longLoopTime = longLoopEnd - longLoopStart;
// print("Long loop time (seconds): " + longLoopTime);
// }

fn returnVoid() {
    print("hello there!");
}

fn returnString() {
    return "crazy string!";
}

fn returnInt() {
    return 0;
}

returnVoid();
print(returnString());
print(returnInt());