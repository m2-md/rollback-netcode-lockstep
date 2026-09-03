// lockstep.ts — pure lockstep: frame does not advance until all inputs arrive.
import { InputBuffer } from "./input-buffer";
import { cloneState, step, type GameState } from "./sim";
import type { InputMessage, SessionOptions } from "./rollback";

export class LockstepSession {
  state: GameState;
  readonly localPlayer: number;
  readonly inputDelay: number;
  stallCount = 0;
  private readonly buffers: InputBuffer[];

  constructor(initial: GameState, opts: SessionOptions) {
    this.state = cloneState(initial);
    this.localPlayer = opts.localPlayer;
    this.inputDelay = opts.inputDelay ?? 0;
    this.buffers = initial.players.map(() => new InputBuffer(256));
  }

  get frame(): number {
    return this.state.frame;
  }

  addLocalInput(input: number): InputMessage {
    const frame = this.state.frame + this.inputDelay;
    this.buffers[this.localPlayer].set(frame, input, true);
    return { player: this.localPlayer, frame, input };
  }

  receive(msg: InputMessage): void {
    this.buffers[msg.player].set(msg.frame, msg.input, true);
  }

  // Sole difference is this check: wait if input is missing. No prediction, no rollback.
  advance(): boolean {
    const f = this.state.frame;
    if (!this.buffers.every((b) => b.isConfirmed(f))) {
      this.stallCount++;
      return false;
    }
    this.state = step(
      this.state,
      this.buffers.map((b) => b.get(f)),
    );
    return true;
  }
}
