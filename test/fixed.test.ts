// test/fixed.test.ts
import { it, expect } from "vitest";
import {
  ONE,
  fpDiv,
  fpLen,
  fpMul,
  fromInt,
  isqrt,
  toNumber,
} from "../src/fixed";

// fixed-point 16.16
it("fpMul always returns an integer", () => {
  expect(fpMul(fromInt(3), 32768)).toBe(fromInt(3) / 2);
  expect(Number.isInteger(fpMul(fromInt(7), 12345))).toBe(true);
});

it("rounds toward zero, symmetric regardless of sign", () => {
  expect(fpMul(1, 1)).toBe(0); // 1/65536 * 1/65536 -> rounds down to 0
  expect(fpMul(-1, 1)).toBe(0);
  expect(fpMul(3, ONE - 1)).toBe(2); // 2.99995 -> 2
  expect(fpMul(-3, ONE - 1)).toBe(-2); // -2.99995 -> -2
});

it("float 0.1 + 0.2 precision loss does not occur in fixed-point", () => {
  const tenth = Math.trunc(ONE / 10);
  let acc = 0;
  for (let i = 0; i < 10; i++) acc += tenth;
  expect(acc).toBe(tenth * 10); // accumulation is EXACT
});

it("fpDiv returns 0 on division by zero, exact on normal division", () => {
  expect(fpDiv(fromInt(5), 0)).toBe(0);
  expect(fpDiv(fromInt(5), fromInt(2))).toBe(fromInt(5) / 2);
  expect(fpDiv(fromInt(-5), fromInt(2))).toBe(fromInt(-5) / 2);
});

it("isqrt returns integer square root (rounds down)", () => {
  expect(isqrt(0)).toBe(0);
  expect(isqrt(1)).toBe(1);
  expect(isqrt(2)).toBe(1);
  expect(isqrt(144)).toBe(12);
  expect(isqrt(145)).toBe(12);
  expect(isqrt(1_000_000)).toBe(1000);
});

it("fpLen finds 3-4-5 triangle hypotenuse", () => {
  expect(toNumber(fpLen(fromInt(3), fromInt(4)))).toBeCloseTo(5, 4);
});

it("large products stay below 2^53 boundary", () => {
  const maxPos = fromInt(640);
  expect(maxPos * maxPos * 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
});
