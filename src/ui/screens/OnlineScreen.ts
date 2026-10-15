import type { MenuAction } from '@/input/MenuInput';
import { Screen, h } from '../Screen';

export type OnlineRole = 'host' | 'guest';
export type OnlineStatusKind = 'idle' | 'busy' | 'ok' | 'error';

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', `online-btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Online lobby: choose HOST or JOIN, then exchange two codes by copy/paste (manual
 * signalling, no server). Shows connection status, round-trip time and the rollback
 * counter of the last match.
 */
export class OnlineScreen extends Screen {
  onHost: (() => void) | null = null;
  onJoin: (() => void) | null = null;
  /** The pasted remote code (host: the guest's reply; guest: the host's code). */
  onSubmit: ((code: string) => void) | null = null;
  onBack: (() => void) | null = null;
  readonly localCode: HTMLTextAreaElement;
  readonly remoteCode: HTMLTextAreaElement;
  private readonly roles: HTMLDivElement;
  private readonly exchange: HTMLDivElement;
  private readonly localLabel: HTMLDivElement;
  private readonly remoteLabel: HTMLDivElement;
  private readonly submit: HTMLButtonElement;
  private readonly status: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private role: OnlineRole | null = null;

  constructor(root: HTMLElement) {
    super(root, 'online-screen');
    this.el.append(h('div', 'menu-title', 'ONLINE'));
    this.roles = h('div', 'online-roles');
    this.roles.append(
      button('HOST A MATCH', 'online-host', () => this.onHost?.()),
      button('JOIN A MATCH', 'online-join', () => this.onJoin?.()),
    );
    this.exchange = h('div', 'online-exchange');
    this.localLabel = h('div', 'online-label');
    this.localCode = h('textarea', 'online-code online-local');
    this.localCode.readOnly = true;
    this.localCode.rows = 4;
    this.localCode.spellcheck = false;
    const copy = button('COPY', 'online-copy', () => this.copyLocal());
    this.remoteLabel = h('div', 'online-label');
    this.remoteCode = h('textarea', 'online-code online-remote');
    this.remoteCode.rows = 4;
    this.remoteCode.spellcheck = false;
    this.remoteCode.placeholder = 'paste here';
    this.submit = button('CONNECT', 'online-submit', () => this.onSubmit?.(this.remoteCode.value));
    const localBox = h('div', 'online-box'), remoteBox = h('div', 'online-box');
    localBox.append(this.localLabel, this.localCode, copy);
    remoteBox.append(this.remoteLabel, this.remoteCode, this.submit);
    this.exchange.append(localBox, remoteBox);
    this.status = h('div', 'online-status');
    this.stats = h('div', 'online-stats');
    this.el.append(this.roles, this.exchange, this.status, this.stats,
      button('BACK', 'online-back', () => this.onBack?.()),
      h('div', 'select-help', 'Host sends a code, guest pastes it and sends a reply back · no server needed · 2/4: back'));
    this.setRole(null);
  }

  /** null = role choice; host/guest = code exchange in that order. */
  setRole(role: OnlineRole | null): void {
    this.role = role;
    this.roles.style.display = role ? 'none' : '';
    this.exchange.style.display = role ? '' : 'none';
    this.localCode.value = '';
    this.remoteCode.value = '';
    if (role === 'host') {
      this.exchange.classList.remove('guest');
      this.localLabel.textContent = '1. SEND THIS CODE TO YOUR OPPONENT';
      this.remoteLabel.textContent = '2. PASTE THEIR REPLY';
      this.submit.textContent = 'CONNECT';
    } else if (role === 'guest') {
      this.exchange.classList.add('guest');
      this.localLabel.textContent = '2. SEND THIS REPLY BACK TO THE HOST';
      this.remoteLabel.textContent = "1. PASTE THE HOST'S CODE";
      this.submit.textContent = 'CREATE REPLY';
    }
    this.setStatus(role ? '' : 'CHOOSE HOST OR JOIN', 'idle');
  }

  get currentRole(): OnlineRole | null { return this.role; }

  setLocalCode(code: string): void {
    this.localCode.value = code;
  }

  setStatus(text: string, kind: OnlineStatusKind): void {
    this.status.textContent = text;
    this.status.dataset.kind = kind;
  }

  setStats(text: string): void {
    this.stats.textContent = text;
  }

  private copyLocal(): void {
    this.localCode.select();
    const text = this.localCode.value;
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => undefined);
  }

  handle(_player: number, action: MenuAction): boolean {
    if (action === 'back') { this.onBack?.(); return true; }
    if (!this.role && (action === 'left' || action === 'up')) { this.onHost?.(); return true; }
    if (!this.role && (action === 'right' || action === 'down')) { this.onJoin?.(); return true; }
    return false;
  }
}
