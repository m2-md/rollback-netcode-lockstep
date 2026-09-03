// fixed.ts — 16.16 fixed-point arithmetic.
// All values are INTEGERS: real number x is stored as integer x * 65536.
export type Fixed = number;

export const FP_BITS = 16;
export const ONE: Fixed = 1 << FP_BITS; // 65536 = 1.0

export function fromInt(n: number): Fixed {
  return n * ONE;
}

export function toNumber(f: Fixed): number {
  return f / ONE;
}

// Multiplication: (a*b) / ONE. Exact division since divisor is power of two,
// trunc stabilizes rounding towards zero. Identical result on every engine.
export function fpMul(a: Fixed, b: Fixed): Fixed {
  // Trailing "+ 0" prevents negative zero (-0 !== 0).
  return Math.trunc((a * b) / ONE) + 0;
}

export function fpDiv(a: Fixed, b: Fixed): Fixed {
  if (b === 0) return 0;
  return Math.trunc((a * ONE) / b) + 0;
}

// Integer square root (Newton). No Math.sqrt — avoiding Math.* in simulation.
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  if (n < 4) return 1;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

// |(x, y)| — input is ONE-scaled, output is ONE-scaled.
export function fpLen(x: Fixed, y: Fixed): Fixed {
  return isqrt(x * x + y * y);
}

export function clamp(v: Fixed, lo: Fixed, hi: Fixed): Fixed {
  return v < lo ? lo : v > hi ? hi : v;
}
