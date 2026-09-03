// sim.ts — deterministik simülasyon. Math.random / sin / cos / sqrt YOK.
import {
  fpMul,
  fpDiv,
  fpLen,
  fromInt,
  toNumber,
  ONE,
  type Fixed,
} from "./fixed";

export const UP = 1;
export const DOWN = 2;
export const LEFT = 4;
export const RIGHT = 8;

export interface Player {
  x: Fixed;
  y: Fixed;
  vx: Fixed;
  vy: Fixed;
}

export interface GameState {
  frame: number;
  players: Player[];
}

export const ARENA_W = fromInt(320);
export const ARENA_H = fromInt(240);
export const RADIUS = fromInt(12);

const ACCEL = 22937; // ~0.35 px/kare²
const FRICTION = 60293; // ~0.92
const MAX_SPEED = 262144; // 4.0 px/kare
const RESTITUTION = 45875; // ~0.7
const SQRT1_2 = 46341; // 0.70710678 * 65536

// Saf fonksiyon: aynı (state, inputs) → her zaman aynı çıktı, bit bit.
export function step(state: GameState, inputs: number[]): GameState {
  const players = state.players.map((p, i) => integrate(p, inputs[i] ?? 0));
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      resolvePair(players[i], players[j]);
    }
  }
  // Duvar en son konuşur: çarpışma itmesi kimseyi arenanın dışına atmasın.
  for (const p of players) bounceWalls(p);
  return { frame: state.frame + 1, players };
}

function integrate(p: Player, input: number): Player {
  let ax = 0;
  let ay = 0;
  if (input & LEFT) ax -= ONE;
  if (input & RIGHT) ax += ONE;
  if (input & UP) ay -= ONE;
  if (input & DOWN) ay += ONE;
  if (ax !== 0 && ay !== 0) {
    // Çapraz harekette hız sabit kalsın. Math.SQRT1_2 değil, tamsayı sabiti.
    ax = fpMul(ax, SQRT1_2);
    ay = fpMul(ay, SQRT1_2);
  }

  let vx = fpMul(p.vx, FRICTION) + fpMul(ax, ACCEL);
  let vy = fpMul(p.vy, FRICTION) + fpMul(ay, ACCEL);

  const speed = fpLen(vx, vy);
  if (speed > MAX_SPEED) {
    vx = fpDiv(fpMul(vx, MAX_SPEED), speed);
    vy = fpDiv(fpMul(vy, MAX_SPEED), speed);
  }

  return { x: p.x + vx, y: p.y + vy, vx, vy };
}

function resolvePair(a: Player, b: Player): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = fpLen(dx, dy);
  const minDist = RADIUS * 2;
  if (dist === 0 || dist >= minDist) return;

  const nx = fpDiv(dx, dist);
  const ny = fpDiv(dy, dist);
  const push = Math.trunc((minDist - dist) / 2);
  a.x -= fpMul(nx, push);
  a.y -= fpMul(ny, push);
  b.x += fpMul(nx, push);
  b.y += fpMul(ny, push);

  // Eşit kütle: normal bileşenleri takas et (yaklaşıyorlarsa).
  const va = fpMul(a.vx, nx) + fpMul(a.vy, ny);
  const vb = fpMul(b.vx, nx) + fpMul(b.vy, ny);
  if (va - vb <= 0) return;
  const d = fpMul(va - vb, RESTITUTION);
  a.vx -= fpMul(d, nx);
  a.vy -= fpMul(d, ny);
  b.vx += fpMul(d, nx);
  b.vy += fpMul(d, ny);
}

function bounceWalls(p: Player): void {
  if (p.x < RADIUS) {
    p.x = RADIUS;
    p.vx = fpMul(-p.vx, RESTITUTION);
  } else if (p.x > ARENA_W - RADIUS) {
    p.x = ARENA_W - RADIUS;
    p.vx = fpMul(-p.vx, RESTITUTION);
  }
  if (p.y < RADIUS) {
    p.y = RADIUS;
    p.vy = fpMul(-p.vy, RESTITUTION);
  } else if (p.y > ARENA_H - RADIUS) {
    p.y = ARENA_H - RADIUS;
    p.vy = fpMul(-p.vy, RESTITUTION);
  }
}

export function createInitialState(): GameState {
  return {
    frame: 0,
    players: [
      { x: fromInt(80), y: fromInt(120), vx: 0, vy: 0 },
      { x: fromInt(240), y: fromInt(120), vx: 0, vy: 0 },
    ],
  };
}

export function cloneState(s: GameState): GameState {
  return {
    frame: s.frame,
    players: s.players.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy })),
  };
}

// Fixed-point durumu piksele çevirir. SADECE çizim için; simülasyon asla float görmez.
export function toDraw(p: Player): { x: number; y: number; r: number } {
  return { x: toNumber(p.x), y: toNumber(p.y), r: toNumber(RADIUS) };
}

// FNV-1a, 32 bit. Simülasyon durumunun parmak izi.
export function hashState(s: GameState): number {
  let h = 0x811c9dc5;
  h = mixInt(h, s.frame);
  for (const p of s.players) {
    h = mixInt(h, p.x);
    h = mixInt(h, p.y);
    h = mixInt(h, p.vx);
    h = mixInt(h, p.vy);
  }
  return h >>> 0;
}

function mixInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (x & 0xff), 0x01000193);
    x >>= 8;
  }
  return h >>> 0;
}
