// YAP standard library: Math

export fn abs(x) {
    if (x < 0) {
        return -x;
    }
    return x;
}

export fn sign(x) {
    if (x > 0) {
        return 1;
    }
    if (x < 0) {
        return -1;
    }
    return 0;
}

export fn max(a, b) {
    if (a > b) {
        return a;
    }
    return b;
}

export fn min(a, b) {
    if (a < b) {
        return a;
    }
    return b;
}

export fn clamp(x, lo, hi) {
    if (x < lo) {
        return lo;
    }
    if (x > hi) {
        return hi;
    }
    return x;
}

export fn is_even(x) {
    return (x % 2) == 0;
}

export fn is_odd(x) {
    return (x % 2) != 0;
}

export fn pow(base, exp) {
    if (exp < 0) {
        return 0;
    }
    var result = 1;
    var i = 0;
    while (i < exp) {
        result = result * base;
        i = i + 1;
    }
    return result;
}

export fn gcd(a, b) {
    a = abs(a);
    b = abs(b);
    while (b != 0) {
        var t = a % b;
        a = b;
        b = t;
    }
    return a;
}

export fn lcm(a, b) {
    if (a == 0 || b == 0) {
        return 0;
    }
    return abs(a * b) / gcd(a, b);
}

export fn factorial(n) {
    if (n < 0) {
        return 0;
    }
    var result = 1;
    var i = 2;
    while (i <= n) {
        result = result * i;
        i = i + 1;
    }
    return result;
}

export fn int_sqrt(n) {
    if (n <= 0) {
        return 0;
    }
    var x = 0;
    while ((x + 1) * (x + 1) <= n) {
        x = x + 1;
    }
    return x;
}
