/** Incremental FNV-1a (32-bit) hasher for integer state checksums. */
export class Hasher {
  private h = 0x811c9dc5;

  int(v: number): this {
    // hash 4 bytes of the int32 representation
    let x = v | 0;
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff;
      this.h = Math.imul(this.h, 0x01000193) >>> 0;
      x >>>= 8;
    }
    return this;
  }

  bool(v: boolean): this {
    return this.int(v ? 1 : 0);
  }

  str(s: string): this {
    for (let i = 0; i < s.length; i++) {
      this.h ^= s.charCodeAt(i) & 0xffff;
      this.h = Math.imul(this.h, 0x01000193) >>> 0;
    }
    return this;
  }

  ints(arr: ArrayLike<number>): this {
    for (let i = 0; i < arr.length; i++) this.int(arr[i] as number);
    return this;
  }

  value(): number {
    return this.h >>> 0;
  }

  hex(): string {
    return this.value().toString(16).padStart(8, '0');
  }
}

export function hashInts(arr: ArrayLike<number>): number {
  return new Hasher().ints(arr).value();
}
