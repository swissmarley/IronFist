/** Fixed-capacity ring buffer over a typed array; zero allocations after construction. */
export class IntRing {
  private readonly buf: Int32Array;
  private head = 0; // index of next write
  private count = 0;

  constructor(readonly capacity: number) {
    this.buf = new Int32Array(capacity);
  }

  push(v: number): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Get element i frames ago (0 = most recent). Returns 0 when out of range. */
  back(i: number): number {
    if (i < 0 || i >= this.count) return 0;
    return this.buf[(this.head - 1 - i + this.capacity * 2) % this.capacity] as number;
  }

  get length(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buf.fill(0);
  }
}
