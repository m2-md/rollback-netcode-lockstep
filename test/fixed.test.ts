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
it("fpMul her zaman tamsayı döndürür", () => {
  expect(fpMul(fromInt(3), 32768)).toBe(fromInt(3) / 2);
  expect(Number.isInteger(fpMul(fromInt(7), 12345))).toBe(true);
});

it("yuvarlama sıfıra doğru, işaretten bağımsız simetrik", () => {
  expect(fpMul(1, 1)).toBe(0); // 1/65536 * 1/65536 → sıfıra iner
  expect(fpMul(-1, 1)).toBe(0);
  expect(fpMul(3, ONE - 1)).toBe(2); // 2.99995 → 2
  expect(fpMul(-3, ONE - 1)).toBe(-2); // -2.99995 → -2
});

it("float'ın 0.1 + 0.2 kaybı fixed-point'te yok", () => {
  const tenth = Math.trunc(ONE / 10);
  let acc = 0;
  for (let i = 0; i < 10; i++) acc += tenth;
  expect(acc).toBe(tenth * 10); // birikim TAM
});

it("fpDiv sıfıra bölmede 0 döner, normal bölmede tam", () => {
  expect(fpDiv(fromInt(5), 0)).toBe(0);
  expect(fpDiv(fromInt(5), fromInt(2))).toBe(fromInt(5) / 2);
  expect(fpDiv(fromInt(-5), fromInt(2))).toBe(fromInt(-5) / 2);
});

it("isqrt tamsayı karekök verir (aşağı yuvarlar)", () => {
  expect(isqrt(0)).toBe(0);
  expect(isqrt(1)).toBe(1);
  expect(isqrt(2)).toBe(1);
  expect(isqrt(144)).toBe(12);
  expect(isqrt(145)).toBe(12);
  expect(isqrt(1_000_000)).toBe(1000);
});

it("fpLen 3-4-5 üçgenini bulur", () => {
  expect(toNumber(fpLen(fromInt(3), fromInt(4)))).toBeCloseTo(5, 4);
});

it("büyük çarpımlar 2^53 sınırının altında kalır", () => {
  const maxPos = fromInt(640);
  expect(maxPos * maxPos * 2).toBeLessThan(Number.MAX_SAFE_INTEGER);
});
