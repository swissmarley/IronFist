import { MatchSim } from '@/sim/match';
import { GREYBOX } from '@/data/characters/greybox';
import { frameFromNumpad, IN_B2 } from '@/input/InputFrame';
import { STATE_NAMES } from '@/sim/fighterState';

const P1 = (dir: number, b = 0) => frameFromNumpad(dir, b, true);
const P2 = (dir: number, b = 0) => frameFromNumpad(dir, b, false);
function trace(label: string, s: MatchSim, n: number, p1: (f: number) => number, p2: (f: number) => number = () => P2(5)): void {
  console.info('---', label);
  for (let f = 0; f < n; f++) {
    s.step([p1(f), p2(f)]);
    const a = s.fighters[0], b = s.fighters[1];
    const evs = s.events.items.map((e) => `${e.type}@${e.a}`).join(',');
    if (evs || f % 4 === 0) console.info(f, STATE_NAMES[a.state], a.moveIdx, a.moveFrame, 'pend', a.pendingMove, '|', STATE_NAMES[b.state], 'y', b.y, 'dist', b.x - a.x, 'bound', b.boundUsed, 'ev', evs);
  }
}
const c = new MatchSim([GREYBOX, GREYBOX], { training: true, startDistance: 1000 });
trace('bound', c, 100, (f) => (f === 0 ? P1(3, IN_B2) : f === 47 || f === 50 ? P1(6) : f === 51 ? P1(2, IN_B2) : P1(5)));
