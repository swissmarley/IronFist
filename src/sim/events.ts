export enum EvType { Hit = 1, Block = 2, Counter = 3, Whiff = 4, Launch = 5, Land = 6, Throw = 7, ThrowBreak = 8, Wall = 9, KO = 10, RoundStart = 11, RoundEnd = 12, MoveStart = 13, Armour = 14, Step = 15, Dash = 16, RingOut = 17, Jump = 18, Parry = 19 }

export interface SimEvent {
  type: EvType;
  a: number;   // acting fighter idx
  b: number;   // other fighter idx (or -1)
  x: number; y: number; z: number;
  strength: number; // 0 light .. 3 launch, or generic payload
  move: number;
  damage: number;
}

/** Preallocated event list; cleared by the consumer after each step. */
export class EventQueue {
  readonly items: SimEvent[] = [];
  private pool: SimEvent[] = [];
  constructor(capacity = 64) {
    for (let i = 0; i < capacity; i++) this.pool.push({ type: EvType.Hit, a: 0, b: -1, x: 0, y: 0, z: 0, strength: 0, move: -1, damage: 0 });
  }
  push(type: EvType, a: number, b: number, x: number, y: number, z: number, strength = 0, move = -1, damage = 0): void {
    const e = this.pool.pop();
    if (!e) return; // drop when saturated; purely cosmetic
    e.type = type; e.a = a; e.b = b; e.x = x; e.y = y; e.z = z; e.strength = strength; e.move = move; e.damage = damage;
    this.items.push(e);
  }
  clear(): void {
    while (this.items.length) this.pool.push(this.items.pop() as SimEvent);
  }
}
