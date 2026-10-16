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

  /** Ints written by `saveTo` (buffer + head + count). */
  get snapshotSize(): number {
    return this.capacity + 2;
  }

  /** Copy the full ring state into `out` at `offset`; returns the next offset. */
  saveTo(out: Int32Array, offset: number): number {
    out.set(this.buf, offset);
    out[offset + this.capacity] = this.head;
    out[offset + this.capacity + 1] = this.count;
    return offset + this.capacity + 2;
  }

  /** Inverse of `saveTo`; returns the next offset. */
  loadFrom(src: Int32Array, offset: number): number {
    this.buf.set(src.subarray(offset, offset + this.capacity));
    this.head = src[offset + this.capacity] as number;
    this.count = src[offset + this.capacity + 1] as number;
    return offset + this.capacity + 2;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.buf.fill(0);
  }
}
