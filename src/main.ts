// main.ts — two clients on the same page with simulated 150ms channel between them.
import { SimulatedChannel } from "./channel";
import { LockstepSession } from "./lockstep";
import { RollbackSession, type InputMessage } from "./rollback";
import {
  ARENA_H,
  ARENA_W,
  DOWN,
  LEFT,
  RIGHT,
  UP,
  createInitialState,
  hashState,
  toDraw,
} from "./sim";

const canvas1 = document.getElementById("c1") as HTMLCanvasElement;
const canvas2 = document.getElementById("c2") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLElement;
const predictCheckbox = document.getElementById(
  "predict",
) as HTMLInputElement;

const init = createInitialState();
const opts = { inputDelay: 2, maxRollback: 12 };
const p1 = new RollbackSession(init, { localPlayer: 0, ...opts });
const p2 = new RollbackSession(init, { localPlayer: 1, ...opts });

const toP2 = new SimulatedChannel<InputMessage>(150);
const toP1 = new SimulatedChannel<InputMessage>(150);

const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.code));
window.addEventListener("keyup", (e) => keys.delete(e.code));

function pollP1(): number {
  let mask = 0;
  if (keys.has("ArrowLeft")) mask |= LEFT;
  if (keys.has("ArrowRight")) mask |= RIGHT;
  if (keys.has("ArrowUp")) mask |= UP;
  if (keys.has("ArrowDown")) mask |= DOWN;
  return mask;
}

function pollP2(): number {
  let mask = 0;
  if (keys.has("KeyA")) mask |= LEFT;
  if (keys.has("KeyD")) mask |= RIGHT;
  if (keys.has("KeyW")) mask |= UP;
  if (keys.has("KeyS")) mask |= DOWN;
  return mask;
}

function draw(canvas: HTMLCanvasElement, session: RollbackSession | LockstepSession) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const colors = ["#4cc9f0", "#f72585"];
  session.state.players.forEach((player, i) => {
    const d = toDraw(player);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
    ctx.strokeStyle = i === session.localPlayer ? "#ffffff" : "#000000";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

const DT = 1000 / 60;
let last = performance.now();
let acc = 0;

function frame(now: number) {
  acc += now - last;
  last = now;
  if (acc > 250) acc = 250; // prevent spiral of death when returning from background tab

  p1.predictionEnabled = predictCheckbox.checked;
  p2.predictionEnabled = predictCheckbox.checked;

  while (acc >= DT) {
    acc -= DT;
    for (const m of toP1.receive()) p1.receive(m);
    for (const m of toP2.receive()) p2.receive(m);

    toP2.send(p1.addLocalInput(pollP1()));
    p1.advance();

    toP1.send(p2.addLocalInput(pollP2()));
    p2.advance();
  }

  draw(canvas1, p1);
  draw(canvas2, p2);

  // Read confirmed frame where both sides know all inputs, not speculative state.
  const cf = Math.min(p1.confirmedFrame, p2.confirmedFrame);
  const s1 = p1.snapshotAt(cf);
  const s2 = p2.snapshotAt(cf);
  const hex = (h: number) => h.toString(16).padStart(8, "0");
  hud.textContent =
    `P1 frame ${p1.frame} · rollback ${p1.rollbackCount} · stall ${p1.stallCount}\n` +
    `P2 frame ${p2.frame} · rollback ${p2.rollbackCount} · stall ${p2.stallCount}\n` +
    `confirmed frame ${cf} · hash ${s1 ? hex(hashState(s1)) : "--------"} / ${s2 ? hex(hashState(s2)) : "--------"}\n` +
    (s1 && s2
      ? hashState(s1) === hashState(s2)
        ? "SYNCED"
        : "DESYNC!"
      : "waiting for confirmed frame…");

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
