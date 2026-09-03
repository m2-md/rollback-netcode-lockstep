// fixed.ts — 16.16 sabit noktalı aritmetik.
// Tüm değerler TAMSAYIDIR: gerçek sayı x, tamsayı olarak x * 65536 tutulur.
export type Fixed = number;

export const FP_BITS = 16;
export const ONE: Fixed = 1 << FP_BITS; // 65536 = 1.0

export function fromInt(n: number): Fixed {
  return n * ONE;
}

export function toNumber(f: Fixed): number {
  return f / ONE;
}

// Çarpım: (a*b) / ONE. Bölen ikinin kuvveti olduğu için bölme TAM,
// trunc ise yuvarlamayı sıfıra doğru sabitler. Aynı sonuç her motorda.
export function fpMul(a: Fixed, b: Fixed): Fixed {
  // Sondaki "+ 0" şaka değil: Math.trunc(-0.4) === -0 döner ve -0, 0'a EŞİT DEĞİLDİR.
  return Math.trunc((a * b) / ONE) + 0;
}

export function fpDiv(a: Fixed, b: Fixed): Fixed {
  if (b === 0) return 0;
  return Math.trunc((a * ONE) / b) + 0;
}

// Tamsayı karekök (Newton). Math.sqrt yok — simülasyonda Math.* kullanmıyoruz.
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

// |(x, y)| — girdiler ONE ölçekli, çıktı da ONE ölçekli.
export function fpLen(x: Fixed, y: Fixed): Fixed {
  return isqrt(x * x + y * y);
}

export function clamp(v: Fixed, lo: Fixed, hi: Fixed): Fixed {
  return v < lo ? lo : v > hi ? hi : v;
}
