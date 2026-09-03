# Rollback Netcode & Deterministic Lockstep

Working code for the article "Two Boards, One Game: Rollback Netcode and
Deterministic Lockstep from Scratch". No server, no authority. Two clients run the
same deterministic simulation and **only inputs** travel between them; when the
opponent's input arrives late it is predicted, and if the prediction misses, time is
rewound and replayed from that frame to the present.

The simulation is **entirely fixed-point integer** (16.16). There is no
`Math.random`, no `Math.sin`, no `Math.cos`, no `Math.sqrt` and not a single floating
point value inside it — determinism is built on that. The verification tool is an
FNV-1a **state hash**.

The network is **simulated** in-page by a fixed-latency channel
(`SimulatedChannel`, 150 ms). WebRTC, WebSocket and a Node process are **not
required**; both the demo and the tests run standalone.

## Install

```bash
npm install
```

## Running it (demo)

```bash
npm run dev
```

- `http://localhost:5173/` → two canvases side by side: **P1 (arrow keys)** and
  **P2 (WASD)**. Each panel is one "client's" own point of view; between them sits a
  one-way channel with 150 ms of latency.
- The HUD shows both sessions' frame number, rollback and stall counters; the bottom
  line shows the hash of the **confirmed frame** on both sides and a `SYNCED` /
  `DESYNC!` stamp.
- Turn the **rollback** checkbox off: prediction is disabled and pure lockstep
  behavior kicks in — movement visibly gets heavy and the `stall` counter takes off.
  Turn it on: the ball moves the instant you press a key, the `rollback` counter
  climbs by tens per second, and no jump is visible on screen.

> Why is the hash taken from the **confirmed** frame? Because the last few frames are
> speculative on both sides (everyone predicts the other's input) and are naturally
> different. Measured: over a 900-frame run the speculative hash differed on 898
> frames, while the confirmed-frame hash was identical 900/900. The sync check is
> done on the confirmed frame.

> If you open it with `file://` you get a blank screen; always open it with
> `npm run dev` (Vite).

## Test

```bash
npm test
```

26 tests, all **pure logic** — no canvas, no DOM, no WebGL, no network:

- `test/fixed.test.ts` (7) — 16.16 arithmetic: rounding symmetric toward zero, the
  negative zero trap (`fpMul(-1, 1) === 0`), accumulation of `0.1` staying EXACT,
  `isqrt`, `fpLen`, the 2^53 budget.
- `test/sim.test.ts` (7) — determinism (same input → same hash and `toEqual`), a
  single frame's difference changing the hash, the purity of `step`, the **float leak
  guard** (every field is `Number.isInteger`), arena bounds, no interpenetration.
- `test/rollback.test.ts` (8) — the `reference` (networkless ground truth) + `runPair`
  (frame-based wire) harness. The main claim: after 240 frames, 9 frames of latency
  and dozens of rewinds, `a.state` is **`toEqual`** to the reference that never
  mispredicted. Also no desync, `inputDelay === latency` → `rollbackCount === 0`,
  going back to the oldest wrong frame (`lastRollbackDepth === 3`), stall, and pure
  lockstep's slow motion.
- `test/channel.test.ts` (4) — a channel with an injected clock + a DOM-free copy of
  the demo loop: the confirmed-frame hash matches 900/900, the speculative frames
  diverge.

## Bench

```bash
npm run bench
```

The real cost of rollback: how many frames get **replayed** per frame? The counters
(rollback / replay / stall) are entirely deterministic; only the ns columns vary by
machine. Actual output (Apple Silicon, Node 22):

```
rollback cost · 3000 frames · inputDelay=2 · maxRollback=24
delay (frames) | ~ms | rollback | replay frames | replay/frame | step/frame | stall
---------------|-----|----------|---------------|--------------|------------|------
             0 |   0 |        0 |             0 |         0.00 |       1.00 |     0
             2 |  33 |        0 |             0 |         0.00 |       1.00 |     0
             4 |  67 |      462 |           922 |         0.31 |       1.31 |     0
             6 | 100 |      462 |          1844 |         0.61 |       1.61 |     0
             9 | 150 |      462 |          3227 |         1.08 |       2.08 |     0
            12 | 200 |      461 |          4600 |         1.53 |       2.53 |     0
            18 | 300 |      460 |          7344 |         2.45 |       3.45 |     0

identical final state across all delays: YES (hash 427844e5)

saveState (cloneState): 25.6 ns · loadState (cloneState): 25.0 ns · step: 636.6 ns
Frame budget at 60 FPS is 16.7 ms; worst-case simulation cost 0.0022 ms.
```

How to read it: the **number** of rewinds is set not by the network but by how often
the player changes direction (462 → 460, nearly constant). What grows with latency is
the **depth** of each mistake: at 150 ms `step` runs an average of 2.08 times per
frame, at 300 ms 3.45 times. The last line is the architecture's proof: whatever the
latency, the hash of the final state is the same (`427844e5`) — the network changes
the road to the result, not the result.

## Build / typecheck

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc && vite build
```

## Files

```
index.html            two canvases (320x240), rollback toggle, HUD
src/fixed.ts          16.16 fixed-point arithmetic (fpMul/fpDiv/isqrt/fpLen)
src/sim.ts            deterministic simulation: step/integrate/resolvePair/
                      bounceWalls + cloneState + FNV-1a hashState
src/input-buffer.ts   ring buffer keyed by frame number, confirmed/predicted stamp, predict
src/lockstep.ts       pure lockstep session (waits on a missing input)
src/rollback.ts       RollbackSession: prediction, rewind, replay, prune
src/channel.ts        fixed-latency in-page channel (injectable clock)
src/main.ts           demo loop: two sessions, two canvases, HUD
src/bench-cli.ts      rollback cost / latency table + save/load/step ns
test/                 26 tests (vitest, DOM-free)
```

## License

MIT
