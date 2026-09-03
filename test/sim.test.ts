// test/sim.test.ts
import { it, expect } from "vitest";
import {
  ARENA_H,
  ARENA_W,
  DOWN,
  LEFT,
  RADIUS,
  RIGHT,
  UP,
  createInitialState,
  hashState,
  step,
  type GameState,
} from "../src/sim";
import { fromInt } from "../src/fixed";

type Script = (frame: number) => [number, number];

function run(script: Script, frames: number): GameState {
  let s = createInitialState();
  for (let f = 0; f < frames; f++) s = step(s, script(f));
  return s;
}

const zigzag = (f: number): [number, number] => [
  f % 20 < 10 ? RIGHT : LEFT | UP,
  f % 13 < 7 ? LEFT | DOWN : RIGHT,
];

// deterministic simulation
it("same input sequence yields identical hash across two runs", () => {
  const a = run(zigzag, 600);
  const b = run(zigzag, 600);
  expect(hashState(a)).toBe(hashState(b));
  expect(a).toEqual(b);
});

it("hash changes if a single frame receives different input", () => {
  const a = run(zigzag, 300);
  const b = run((f) => (f === 150 ? [UP, DOWN] : zigzag(f)), 300);
  expect(hashState(a)).not.toBe(hashState(b));
});

it("step is pure: input state is not mutated", () => {
  const s = createInitialState();
  const before = JSON.parse(JSON.stringify(s));
  step(s, [RIGHT, LEFT]);
  expect(s).toEqual(before);
});

it("all fields remain integers (no float leakage)", () => {
  const s = run(zigzag, 400);
  for (const p of s.players) {
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.vx)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
    expect(Number.isInteger(p.vy)).toBe(true);
  }
});

it("players stay within arena boundaries", () => {
  const s = run(() => [RIGHT | DOWN, RIGHT | DOWN], 500);
  for (const p of s.players) {
    expect(p.x).toBeGreaterThanOrEqual(RADIUS);
    expect(p.x).toBeLessThanOrEqual(ARENA_W - RADIUS);
    expect(p.y).toBeGreaterThanOrEqual(RADIUS);
    expect(p.y).toBeLessThanOrEqual(ARENA_H - RADIUS);
  }
});

it("players do not pass through each other under opposing pressure", () => {
  // P1 moves right, P2 moves left: head-on collision.
  const s = run(() => [RIGHT, LEFT], 300);
  const [a, b] = s.players;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const minDist = RADIUS * 2 - fromInt(1); // 1 px tolerance
  expect(dx * dx + dy * dy).toBeGreaterThan(minDist * minDist);
});

it("hashState returns 32-bit unsigned integer", () => {
  const s = run(zigzag, 120);
  const h = hashState(s);
  expect(Number.isInteger(h)).toBe(true);
  expect(h).toBeGreaterThanOrEqual(0);
  expect(h).toBeLessThanOrEqual(0xffffffff);
});
