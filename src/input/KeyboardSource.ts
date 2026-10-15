import { ACTIONS, ACTION_BITS, type KeyBindings } from './bindings';
import type { InputFrame } from './InputFrame';

/** Tracks held keys and produces an InputFrame for a given binding set. */
export class KeyboardSource {
  private held = new Set<string>();
  private readonly onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.held.add(e.code);
    if (this.isBound(e.code)) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => { this.held.delete(e.code); };
  private readonly onBlur = (): void => { this.held.clear(); };
  private boundCodes = new Set<string>();

  constructor(private bindingSets: KeyBindings[]) {
    this.rebuild();
  }

  attach(target: Window = window): void {
    target.addEventListener('keydown', this.onDown);
    target.addEventListener('keyup', this.onUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(target: Window = window): void {
    target.removeEventListener('keydown', this.onDown);
    target.removeEventListener('keyup', this.onUp);
    target.removeEventListener('blur', this.onBlur);
  }

  setBindings(sets: KeyBindings[]): void {
    this.bindingSets = sets;
    this.rebuild();
  }

  private rebuild(): void {
    this.boundCodes.clear();
    for (const set of this.bindingSets) for (const a of ACTIONS) for (const c of set[a]) this.boundCodes.add(c);
  }

  private isBound(code: string): boolean {
    return this.boundCodes.has(code);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  /** Sample the frame for binding set index i. */
  sample(i: number): InputFrame {
    const set = this.bindingSets[i];
    if (!set) return 0;
    let f = 0;
    for (const a of ACTIONS) {
      const codes = set[a];
      for (let k = 0; k < codes.length; k++) {
        if (this.held.has(codes[k] as string)) { f |= ACTION_BITS[a]; break; }
      }
    }
    return f;
  }

  /** Inject a synthetic key state (used by tests / touch). */
  setKey(code: string, down: boolean): void {
    if (down) this.held.add(code); else this.held.delete(code);
  }
}
