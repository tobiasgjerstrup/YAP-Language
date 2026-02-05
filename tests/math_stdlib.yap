import { abs, sign, max, min, clamp, is_even, is_odd, pow, gcd, lcm, factorial, int_sqrt } from "std/Math.yap";

print(abs(-5));         // 5
print(sign(-7));        // -1
print(sign(0));         // 0
print(sign(9));         // 1
print(max(3, 9));       // 9
print(min(3, 9));       // 3
print(clamp(5, 1, 4));  // 4
print(is_even(10));     // true
print(is_odd(7));       // true
print(pow(2, 8));       // 256
print(gcd(54, 24));     // 6
print(lcm(6, 8));       // 24
print(factorial(5));    // 120
print(int_sqrt(26));    // 5
