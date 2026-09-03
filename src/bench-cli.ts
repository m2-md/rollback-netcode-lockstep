// bench-cli.ts — rollback'in gerçek maliyeti: kare başına kaç kare YENİDEN oynanıyor?
// Ağ yok, Math.random yok: mesajlar kare numarasıyla teslim edilir, girdi deseni
// sabit bir betikten gelir. Sayaçlar (rollback, replay, stall) tamamen deterministik;
// yalnızca ms sütunları makineye göre değişir.
import { RollbackSession, type InputMessage } from "./rollback";
import { cloneState, createInitialState, hashState, step } from "./sim";
import { LEFT, RIGHT, UP, DOWN } from "./sim";

type Script = (frame: number) => number;

const FRAMES = 3000;
const DELAYS = [0, 2, 4, 6, 9, 12, 18]; // tek yön gecikme, kare cinsinden
const INPUT_DELAY = 2;

const scripts: [Script, Script] = [
  (f) => (f % 20 < 10 ? RIGHT : LEFT | UP),
  (f) => (f % 13 < 7 ? LEFT | DOWN : RIGHT),
];

interface Result {
  delayFrames: number;
  rollbacks: number;
  replayed: number;
  stalls: number;
  msPerFrame: number;
  hash: number;
}

function measure(delayFrames: number, maxRollback: number): Result {
  const init = createInitialState();
  const common = { inputDelay: INPUT_DELAY, maxRollback };
  const a = new RollbackSession(init, { localPlayer: 0, ...common });
  const b = new RollbackSession(init, { localPlayer: 1, ...common });
  const wire: { at: number; to: RollbackSession; msg: InputMessage }[] = [];

  let replayed = 0;
  let seenRollbacks = 0;

  const start = performance.now();
  for (let t = 0; t < FRAMES; t++) {
    while (wire.length > 0 && wire[0].at <= t) {
      const p = wire.shift()!;
      p.to.receive(p.msg);
    }
    wire.push({
      at: t + delayFrames,
      to: b,
      msg: a.addLocalInput(scripts[0](t)),
    });
    wire.push({
      at: t + delayFrames,
      to: a,
      msg: b.addLocalInput(scripts[1](t)),
    });
    a.advance();
    if (a.rollbackCount > seenRollbacks) {
      seenRollbacks = a.rollbackCount;
      replayed += a.lastRollbackDepth;
    }
    b.advance();
  }
  const elapsed = performance.now() - start;

  // Ölçüm dışı: telde kalanı boşalt, son geri sarma otursun. Böylece her
  // gecikme değeri AYNI son duruma varmak zorunda — hash bunu ispatlar.
  for (const p of wire) p.to.receive(p.msg);
  a.advance();
  b.advance();

  return {
    delayFrames,
    rollbacks: a.rollbackCount,
    replayed,
    stalls: a.stallCount,
    msPerFrame: elapsed / FRAMES / 2, // iki oturum koştu
    hash: hashState(a.state),
  };
}

function benchStateOps(): { save: number; load: number; stepNs: number } {
  const s = createInitialState();
  let sink = 0;

  // Isınma
  for (let i = 0; i < 10_000; i++) sink += cloneState(s).frame;

  const N = 200_000;
  let t0 = performance.now();
  for (let i = 0; i < N; i++) sink += cloneState(s).frame;
  const save = ((performance.now() - t0) * 1e6) / N;

  const snap = cloneState(s);
  t0 = performance.now();
  for (let i = 0; i < N; i++) sink += cloneState(snap).players.length;
  const load = ((performance.now() - t0) * 1e6) / N;

  const inputs = [RIGHT, LEFT | UP];
  for (let i = 0; i < 10_000; i++) sink += step(s, inputs).frame;
  t0 = performance.now();
  for (let i = 0; i < N; i++) sink += step(s, inputs).frame;
  const stepNs = ((performance.now() - t0) * 1e6) / N;

  if (sink === -1) console.log("unreachable");
  return { save, load, stepNs };
}

const pad = (v: string, w: number): string => v.padStart(w);

console.log(
  `rollback maliyeti · ${FRAMES} kare · inputDelay=${INPUT_DELAY} · maxRollback=24`,
);
console.log(
  "gecikme (kare) | ~ms | rollback | replay kare | replay/kare | step/kare | stall",
);
console.log(
  "---------------|-----|----------|-------------|-------------|-----------|------",
);

const results: Result[] = [];
for (const d of DELAYS) {
  const r = measure(d, 24);
  results.push(r);
  console.log(
    [
      pad(String(r.delayFrames), 14),
      pad((r.delayFrames * (1000 / 60)).toFixed(0), 3),
      pad(String(r.rollbacks), 8),
      pad(String(r.replayed), 11),
      pad((r.replayed / FRAMES).toFixed(2), 11),
      pad((1 + r.replayed / FRAMES).toFixed(2), 9),
      pad(String(r.stalls), 5),
    ].join(" | "),
  );
}

const allSame = results.every((r) => r.hash === results[0].hash);
console.log(
  `\nher gecikmede aynı son durum: ${allSame ? "EVET" : "HAYIR"} ` +
    `(hash ${results[0].hash.toString(16).padStart(8, "0")})`,
);

const ops = benchStateOps();
console.log(
  `\nsaveState (cloneState): ${ops.save.toFixed(1)} ns · ` +
    `loadState (cloneState): ${ops.load.toFixed(1)} ns · ` +
    `step: ${ops.stepNs.toFixed(1)} ns`,
);
console.log(
  `60 FPS'te kare bütçesi 16.7 ms; en kötü satırın simülasyon maliyeti ` +
    `${(((1 + results[results.length - 1].replayed / FRAMES) * ops.stepNs + ops.save) / 1e6).toFixed(4)} ms.`,
);
