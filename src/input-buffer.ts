// input-buffer.ts — kare numarasına göre girdi saklayan halka tampon.
export class InputBuffer {
  private readonly owner: Int32Array; // slot -> hangi kare
  private readonly value: Int32Array; // slot -> girdi bitleri
  private readonly sure: Uint8Array; // slot -> 1: gerçek, 0: tahmin
  lastConfirmed = -1;

  constructor(private readonly size = 256) {
    this.owner = new Int32Array(size).fill(-1);
    this.value = new Int32Array(size);
    this.sure = new Uint8Array(size);
  }

  private slot(frame: number): number {
    return ((frame % this.size) + this.size) % this.size;
  }

  set(frame: number, input: number, confirmed: boolean): void {
    const s = this.slot(frame);
    this.owner[s] = frame;
    this.value[s] = input;
    this.sure[s] = confirmed ? 1 : 0;
    if (confirmed && frame > this.lastConfirmed) this.lastConfirmed = frame;
  }

  has(frame: number): boolean {
    return this.owner[this.slot(frame)] === frame;
  }

  isConfirmed(frame: number): boolean {
    return this.has(frame) && this.sure[this.slot(frame)] === 1;
  }

  get(frame: number): number {
    return this.has(frame) ? this.value[this.slot(frame)] : 0;
  }

  // Tahmin: "oyuncu ne yapıyorsa onu yapmaya devam eder."
  // Bilinen en son ONAYLI girdiyi tekrarla.
  predict(frame: number): number {
    const from = Math.min(frame - 1, this.lastConfirmed);
    const floor = Math.max(0, frame - this.size);
    for (let f = from; f >= floor; f--) {
      if (this.isConfirmed(f)) return this.value[this.slot(f)];
    }
    return 0;
  }
}
