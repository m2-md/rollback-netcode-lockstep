// main.ts — iki "istemci" aynı sayfada, aralarında 150ms'lik simüle kanal.
import { SimulatedChannel } from "./channel";
import { RollbackSession, type InputMessage } from "./rollback";
import {
  createInitialState,
  hashState,
  toDraw,
  UP,
  DOWN,
  LEFT,
  RIGHT,
} from "./sim";

const FPS = 60;
const FRAME_MS = 1000 / FPS;

const held = new Set<string>();
addEventListener("keydown", (e) => held.add(e.code));
addEventListener("keyup", (e) => held.delete(e.code));

function readKeys(map: Record<string, number>): number {
  let bits = 0;
  for (const code in map) if (held.has(code)) bits |= map[code];
  return bits;
}

const ARROWS = {
  ArrowUp: UP,
  ArrowDown: DOWN,
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
};
const WASD = { KeyW: UP, KeyS: DOWN, KeyA: LEFT, KeyD: RIGHT };

const init = createInitialState();
const p1 = new RollbackSession(init, {
  localPlayer: 0,
  inputDelay: 2,
  maxRollback: 12,
});
const p2 = new RollbackSession(init, {
  localPlayer: 1,
  inputDelay: 2,
  maxRollback: 12,
});

const toP2 = new SimulatedChannel<InputMessage>(150);
const toP1 = new SimulatedChannel<InputMessage>(150);

const canvas1 = document.getElementById("p1") as HTMLCanvasElement;
const canvas2 = document.getElementById("p2") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLPreElement;
const toggle = document.getElementById("rollback") as HTMLInputElement;

toggle.addEventListener("change", () => {
  p1.predictionEnabled = toggle.checked;
  p2.predictionEnabled = toggle.checked;
});

function draw(canvas: HTMLCanvasElement, session: RollbackSession): void {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  session.state.players.forEach((p, i) => {
    const { x, y, r } = toDraw(p);
    ctx.fillStyle = i === session.localPlayer ? "#4ea1ff" : "#ff8a4e";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
}

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // sekme arkaplandan dönünce ölüm sarmalı olmasın

  while (acc >= FRAME_MS) {
    acc -= FRAME_MS;
    for (const m of toP1.receive()) p1.receive(m);
    for (const m of toP2.receive()) p2.receive(m);
    toP2.send(p1.addLocalInput(readKeys(ARROWS)));
    p1.advance();
    toP1.send(p2.addLocalInput(readKeys(WASD)));
    p2.advance();
  }

  draw(canvas1, p1);
  draw(canvas2, p2);

  // Hash'i SPEKÜLATİF durumdan değil, iki tarafın da tüm girdilerini bildiği
  // en son ONAYLI kareden alıyoruz. Tahmin edilmiş kareler farklı olabilir.
  const cf = Math.min(p1.confirmedFrame, p2.confirmedFrame);
  const s1 = p1.snapshotAt(cf);
  const s2 = p2.snapshotAt(cf);
  const hex = (h: number) => h.toString(16).padStart(8, "0");
  hud.textContent =
    `P1 kare ${p1.frame} · rollback ${p1.rollbackCount} · stall ${p1.stallCount}\n` +
    `P2 kare ${p2.frame} · rollback ${p2.rollbackCount} · stall ${p2.stallCount}\n` +
    `onaylı kare ${cf} · hash ${s1 ? hex(hashState(s1)) : "--------"} / ${s2 ? hex(hashState(s2)) : "--------"}\n` +
    (s1 && s2
      ? hashState(s1) === hashState(s2)
        ? "SENKRON"
        : "DESYNC!"
      : "onaylı kare bekleniyor…");

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
