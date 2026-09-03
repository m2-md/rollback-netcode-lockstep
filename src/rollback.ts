// rollback.ts — tahmin et, yanılırsan geri sar.
import { InputBuffer } from "./input-buffer";
import { cloneState, step, type GameState } from "./sim";

export interface InputMessage {
  player: number;
  frame: number;
  input: number;
}

export interface SessionOptions {
  localPlayer: number;
  inputDelay?: number;
  maxRollback?: number;
}

export class RollbackSession {
  state: GameState;
  readonly localPlayer: number;
  readonly remotePlayer: number;
  readonly inputDelay: number;
  readonly maxRollback: number;

  predictionEnabled = true;
  rollbackCount = 0;
  lastRollbackDepth = 0;
  stallCount = 0;

  private readonly buffers: InputBuffer[];
  private readonly saved = new Map<number, GameState>();
  private pendingRollbackTo: number | null = null;

  constructor(initial: GameState, opts: SessionOptions) {
    this.state = cloneState(initial);
    this.localPlayer = opts.localPlayer;
    this.remotePlayer = 1 - opts.localPlayer;
    this.inputDelay = opts.inputDelay ?? 2;
    this.maxRollback = opts.maxRollback ?? 8;
    this.buffers = initial.players.map(() => new InputBuffer(256));
  }

  get frame(): number {
    return this.state.frame;
  }

  // Girdilerinin tamamı onaylanmış en son kare. Senkron kontrolü BURADA yapılır:
  // spekülatif kareler iki tarafta farklı olabilir, onaylı kareler asla.
  get confirmedFrame(): number {
    let f = this.state.frame;
    for (const b of this.buffers) f = Math.min(f, b.lastConfirmed + 1);
    return Math.max(0, f);
  }

  snapshotAt(frame: number): GameState | undefined {
    if (frame === this.state.frame) return this.state;
    return this.saved.get(frame);
  }

  addLocalInput(input: number): InputMessage {
    // Girdi ŞİMDİ değil, inputDelay kare SONRASI için planlanır.
    const frame = this.state.frame + this.inputDelay;
    this.buffers[this.localPlayer].set(frame, input, true);
    return { player: this.localPlayer, frame, input };
  }

  // Uzak girdi geldi. Tahminimiz yanlışsa geri sarma borcu yazılır.
  receive(msg: InputMessage): void {
    const buf = this.buffers[msg.player];
    if (buf.isConfirmed(msg.frame)) return; // yinelenen paket
    const guessed = buf.has(msg.frame) ? buf.get(msg.frame) : null;
    buf.set(msg.frame, msg.input, true);
    if (
      guessed !== null &&
      guessed !== msg.input &&
      msg.frame < this.state.frame
    ) {
      this.pendingRollbackTo =
        this.pendingRollbackTo === null
          ? msg.frame
          : Math.min(this.pendingRollbackTo, msg.frame);
    }
  }

  advance(): boolean {
    if (this.pendingRollbackTo !== null) this.rollback();
    if (!this.canAdvance()) {
      this.stallCount++;
      return false;
    }
    this.simulateFrame();
    this.prune();
    return true;
  }

  // Tahmin penceresi dolduysa duraklar (stall) — yoksa geri saramayız.
  canAdvance(): boolean {
    if (!this.predictionEnabled) {
      return this.buffers.every((b) => b.isConfirmed(this.state.frame));
    }
    const confirmed = this.buffers[this.remotePlayer].lastConfirmed;
    return this.state.frame - confirmed <= this.maxRollback;
  }

  private simulateFrame(): void {
    const f = this.state.frame;
    this.saved.set(f, cloneState(this.state));
    const inputs = this.buffers.map((buf) => {
      if (buf.isConfirmed(f)) return buf.get(f);
      const guess = buf.predict(f);
      buf.set(f, guess, false); // tahmini yaz ki neyi yanlış bildiğimizi bilelim
      return guess;
    });
    this.state = step(this.state, inputs);
  }

  private rollback(): void {
    const target = this.pendingRollbackTo as number;
    this.pendingRollbackTo = null;
    const snapshot = this.saved.get(target);
    if (!snapshot) return; // pencereden düşmüş: kurtarılamaz
    const replayTo = this.state.frame;
    this.state = cloneState(snapshot);
    this.rollbackCount++;
    this.lastRollbackDepth = replayTo - target;
    while (this.state.frame < replayTo) this.simulateFrame();
  }

  private prune(): void {
    const oldest = this.state.frame - this.maxRollback - 1;
    for (const f of this.saved.keys()) {
      if (f < oldest) this.saved.delete(f);
    }
  }
}
