// test/channel.test.ts
import { it, expect } from "vitest";
import { SimulatedChannel } from "../src/channel";
import { RollbackSession, type InputMessage } from "../src/rollback";
import {
  DOWN,
  LEFT,
  RIGHT,
  UP,
  createInitialState,
  hashState,
} from "../src/sim";

// SimulatedChannel
it("paketi ancak gecikme dolduktan sonra teslim eder", () => {
  let clock = 0;
  const ch = new SimulatedChannel<string>(150, () => clock);
  ch.send("a");
  expect(ch.receive()).toEqual([]);
  clock = 149;
  expect(ch.receive()).toEqual([]);
  clock = 150;
  expect(ch.receive()).toEqual(["a"]);
  expect(ch.receive()).toEqual([]); // iki kez teslim etmez
});

it("gönderim sırasını korur", () => {
  let clock = 0;
  const ch = new SimulatedChannel<number>(100, () => clock);
  ch.send(1);
  clock = 10;
  ch.send(2);
  clock = 109;
  expect(ch.receive()).toEqual([1]);
  clock = 110;
  expect(ch.receive()).toEqual([2]);
});

// main.ts döngüsünün DOM'suz kopyası: enjekte saat, gerçek kanal, gerçek oturumlar.
function runDemoLoop(ticks: number) {
  const FRAME_MS = 1000 / 60;
  let clock = 0;
  const now = () => clock;

  const init = createInitialState();
  const opts = { inputDelay: 2, maxRollback: 12 };
  const p1 = new RollbackSession(init, { localPlayer: 0, ...opts });
  const p2 = new RollbackSession(init, { localPlayer: 1, ...opts });
  const toP2 = new SimulatedChannel<InputMessage>(150, now);
  const toP1 = new SimulatedChannel<InputMessage>(150, now);

  const k1 = (t: number) => (t % 20 < 10 ? RIGHT : LEFT | UP);
  const k2 = (t: number) => (t % 13 < 7 ? LEFT | DOWN : RIGHT);

  let speculativeMismatch = 0;
  let confirmedMismatch = 0;
  let confirmedChecks = 0;

  for (let t = 0; t < ticks; t++) {
    clock = t * FRAME_MS;
    for (const m of toP1.receive()) p1.receive(m);
    for (const m of toP2.receive()) p2.receive(m);
    toP2.send(p1.addLocalInput(k1(t)));
    p1.advance();
    toP1.send(p2.addLocalInput(k2(t)));
    p2.advance();

    if (p1.frame === p2.frame && hashState(p1.state) !== hashState(p2.state)) {
      speculativeMismatch++;
    }
    const cf = Math.min(p1.confirmedFrame, p2.confirmedFrame);
    const s1 = p1.snapshotAt(cf);
    const s2 = p2.snapshotAt(cf);
    if (s1 && s2) {
      confirmedChecks++;
      if (hashState(s1) !== hashState(s2)) confirmedMismatch++;
    }
  }

  return {
    p1,
    p2,
    speculativeMismatch,
    confirmedMismatch,
    confirmedChecks,
  };
}

// demo döngüsü (150 ms simüle kanal)
it("onaylı karede iki taraf HER ZAMAN aynı hash'i verir", () => {
  const r = runDemoLoop(900);
  expect(r.confirmedChecks).toBe(900);
  expect(r.confirmedMismatch).toBe(0);
  expect(r.p1.frame).toBe(r.p2.frame);
  expect(r.p1.rollbackCount).toBeGreaterThan(0);
  expect(r.p1.stallCount).toBe(0);
});

it("spekülatif kareler ayrışır — senkron kontrolü onaylı karede yapılmalı", () => {
  const r = runDemoLoop(900);
  expect(r.speculativeMismatch).toBeGreaterThan(500);
});
