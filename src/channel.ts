// channel.ts — tek yönlü, sabit gecikmeli sayfa-içi kanal.
export class SimulatedChannel<T> {
  private queue: { deliverAt: number; payload: T }[] = [];

  constructor(
    public latencyMs = 150,
    private readonly now: () => number = () => performance.now(),
  ) {}

  send(payload: T): void {
    this.queue.push({ deliverAt: this.now() + this.latencyMs, payload });
  }

  receive(): T[] {
    const t = this.now();
    const ready = this.queue.filter((p) => p.deliverAt <= t);
    this.queue = this.queue.filter((p) => p.deliverAt > t);
    return ready.map((p) => p.payload);
  }
}
