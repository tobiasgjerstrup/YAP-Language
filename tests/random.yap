var max = 0;
var min = 2147483647;
while (true) {
    var r = random();

    if (r < min) {
        min = r;
        print("New min: " + min);
    }

    if (r > max) {
        max = r;
        print("New max: " + max);
    }

    if (min < 100) {
        return;
    }

    if (max > 2147483547) {
        return;
    }
}