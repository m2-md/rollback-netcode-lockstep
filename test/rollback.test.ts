// test/rollback.test.ts
import { it, expect } from "vitest";
import { RollbackSession, type InputMessage } from "../src/rollback";
import { LockstepSession } from "../src/lockstep";
import {
  DOWN,
  LEFT,
  RIGHT,
  UP,
  createInitialState,
  hashState,
  step,
} from "../src/sim";

type Script = (frame: number) => number;

// Headless reference: what if every input were known in time?
function reference(
  scripts: [Script, Script],
  frames: number,
  inputDelay: number,
) {
  let s = createInitialState();
  for (let f = 0; f < frames; f++) {
    const at = (i: 0 | 1) =>
      f - inputDelay >= 0 ? scripts[i](f - inputDelay) : 0;
    s = step(s, [at(0), at(1)]);
  }
  return s;
}

// Two sessions connected over wire with delayFrames latency.
function runPair(opts: {
  frames: number;
  delayFrames: number;
  inputDelay: number;
  scripts: [Script, Script];
  maxRollback?: number;
}) {
  const init = createInitialState();
  const common = {
    inputDelay: opts.inputDelay,
    maxRollback: opts.maxRollback ?? 12,
  };
  const a = new RollbackSession(init, { localPlayer: 0, ...common });
  const b = new RollbackSession(init, { localPlayer: 1, ...common });
  const wire: { at: number; to: RollbackSession; msg: InputMessage }[] = [];

  for (let t = 0; t < opts.frames; t++) {
    for (const p of wire) if (p.at === t) p.to.receive(p.msg);
    wire.push({
      at: t + opts.delayFrames,
      to: b,
      msg: a.addLocalInput(opts.scripts[0](t)),
    });
    wire.push({
      at: t + opts.delayFrames,
      to: a,
      msg: b.addLocalInput(opts.scripts[1](t)),
    });
    a.advance();
    b.advance();
  }

  // Drain remaining messages and wait for final rollback to settle.
  for (const p of wire) if (p.at >= opts.frames) p.to.receive(p.msg);
  a.advance();
  b.advance();
  return { a, b };
}

const FRAMES = 240;
const DELAY = 9; // ~150ms @ 60fps

const scripts: [Script, Script] = [
  (f) => (f % 20 < 10 ? RIGHT : LEFT | UP),
  (f) => (f % 13 < 7 ? LEFT | DOWN : RIGHT),
];

// rollback
it("rollback+replay result matches non-speculative reference EXACTLY", () => {
  const { a } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts,
  });
  const ref = reference(scripts, a.frame, 2);
  expect(a.state).toEqual(ref);
  expect(hashState(a.state)).toBe(hashState(ref));
  expect(a.rollbackCount).toBeGreaterThan(0); // verified rollback occurred
});

it("both sides arrive at the same frame and hash (no desync)", () => {
  const { a, b } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts,
  });
  expect(a.frame).toBe(b.frame);
  expect(hashState(a.state)).toBe(hashState(b.state));
});

it("no rollback occurs if input delay covers network latency", () => {
  const { a, b } = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: DELAY, // compensated waiting with input delay
    scripts,
  });
  expect(a.rollbackCount).toBe(0);
  expect(b.rollbackCount).toBe(0);
  expect(hashState(a.state)).toBe(
    hashState(reference(scripts, a.frame, DELAY)),
  );
});

it("prediction succeeds on constant input, fails frequently on changing input", () => {
  const steady = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts: [() => RIGHT, () => LEFT],
  });
  expect(steady.a.rollbackCount).toBeLessThanOrEqual(1);

  const jitter = runPair({
    frames: FRAMES,
    delayFrames: DELAY,
    inputDelay: 2,
    scripts,
  });
  expect(jitter.a.rollbackCount).toBeGreaterThan(10);
});

it("incorrect prediction rolls back to the OLDEST faulty frame", () => {
  const s = new RollbackSession(createInitialState(), {
    localPlayer: 0,
    inputDelay: 0,
    maxRollback: 16,
  });
  for (let f = 0; f < 5; f++)
    s.receive({ player: 1, frame: f, input: RIGHT });
  for (let f = 0; f < 10; f++) {
    s.addLocalInput(0);
    s.advance();
  }
  expect(s.frame).toBe(10);
  expect(s.rollbackCount).toBe(0); // 5..9 predicted as "continue RIGHT"

  s.receive({ player: 1, frame: 5, input: RIGHT }); // prediction correct
  s.receive({ player: 1, frame: 6, input: RIGHT }); // prediction correct
  s.receive({ player: 1, frame: 7, input: LEFT }); // PREDICTION MISMATCH
  s.receive({ player: 1, frame: 8, input: LEFT });
  s.addLocalInput(0);
  s.advance();

  expect(s.rollbackCount).toBe(1);
  expect(s.lastRollbackDepth).toBe(3); // 10 - 7
  expect(s.frame).toBe(11);
});

it("stalls when prediction window is full, does not diverge", () => {
  const s = new RollbackSession(createInitialState(), {
    localPlayer: 0,
    inputDelay: 0,
    maxRollback: 4,
  });
  for (let f = 0; f < 20; f++) {
    s.addLocalInput(UP);
    s.advance();
  }
  expect(s.frame).toBeLessThanOrEqual(5);
  expect(s.stallCount).toBeGreaterThan(0);
});

// pure lockstep
it("does not advance on missing input, advances when input arrives", () => {
  const s = new LockstepSession(createInitialState(), {
    localPlayer: 0,
    inputDelay: 0,
  });
  s.addLocalInput(RIGHT);
  expect(s.advance()).toBe(false);
  expect(s.frame).toBe(0);
  expect(s.stallCount).toBe(1);

  s.receive({ player: 1, frame: 0, input: LEFT | DOWN });
  expect(s.advance()).toBe(true);
  expect(s.frame).toBe(1);
});

it("lockstep slows time into heavy slow-motion under 9-frame delay", () => {
  const init = createInitialState();
  const a = new LockstepSession(init, { localPlayer: 0, inputDelay: 0 });
  const b = new LockstepSession(init, { localPlayer: 1, inputDelay: 0 });
  const wire: { at: number; to: LockstepSession; msg: InputMessage }[] = [];
  const TICKS = 100;
  let advanced = 0;

  for (let t = 0; t < TICKS; t++) {
    for (const p of wire) if (p.at === t) p.to.receive(p.msg);
    wire.push({ at: t + DELAY, to: b, msg: a.addLocalInput(scripts[0](t)) });
    wire.push({ at: t + DELAY, to: a, msg: b.addLocalInput(scripts[1](t)) });
    if (a.advance()) advanced++;
    b.advance();
  }

  expect(advanced).toBeLessThan(15); // 100 ticks, fewer than 15 frames
  expect(a.stallCount).toBeGreaterThan(80);
  expect(a.frame).toBe(b.frame);
});
