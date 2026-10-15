/** Original story-lite dialogue: arcade intro lines and endings per fighter. */
export interface Line { speaker: string; line: string }

export const SUBBOSS_ID = 'ricardo';
export const BOSS_ID = 'golem';

export const SUBBOSS_INTRO: Line[] = [
  { speaker: 'Ricardo', line: 'Three stances, one answer. Show me which one you fear.' },
  { speaker: '', line: 'The gate to the final tower opens only for those who pass him.' },
];

export const BOSS_INTRO: Line[] = [
  { speaker: '', line: 'Stone grinds. The tournament\'s guardian wakes.' },
  { speaker: 'Golem', line: 'NOTHING THAT STANDS BEFORE ME STAYS STANDING.' },
];

const DEFAULT_ENDING: Line[] = [
  { speaker: '', line: 'The guardian falls silent. The iron tournament has a new champion.' },
  { speaker: '', line: 'But the tower hums again before dawn. Someone else is already climbing.' },
];

export const ENDINGS: Record<string, Line[]> = {
  kaede: [
    { speaker: 'Kaede', line: 'Every strike I threw tonight was one my teacher never got to see.' },
    { speaker: '', line: 'She bows to the empty dojo at sunrise, then opens its doors to the first student.' },
  ],
  boris: [
    { speaker: 'Boris', line: 'They said the Bear was too slow for this tower. The tower disagrees.' },
    { speaker: '', line: 'He carries the trophy home in one hand and his daughter on his shoulders.' },
  ],
  luiz: [
    { speaker: 'Luiz', line: 'The roda never ends. It only changes the song.' },
    { speaker: '', line: 'Down on the harbour deck the drums start up again, and Luiz is already dancing.' },
  ],
  meiling: [
    { speaker: 'Mei-Ling', line: 'Too slow. All of them. Even the mountain.' },
    { speaker: '', line: 'The fastest kicker in the city buys noodles for the whole street with her prize.' },
  ],
  jaehyun: [
    { speaker: 'Jae-Hyun', line: 'Discipline is a kick thrown ten thousand times. Tonight was ten thousand and one.' },
    { speaker: '', line: 'He posts the medal to his old academy with no return address.' },
  ],
  golem: [
    { speaker: 'Golem', line: '...' },
    { speaker: '', line: 'The guardian returns to its plinth. Moss grows. The tower waits.' },
  ],
  ricardo: [
    { speaker: 'Ricardo', line: 'Iron, silk, storm. The tower taught me a fourth: patience.' },
    { speaker: '', line: 'He closes his notebook of stances and finally writes a name on the cover.' },
  ],
  seraphine: [
    { speaker: 'Seraphine', line: 'You were never fighting me. You were fighting where I was going to be.' },
    { speaker: '', line: 'The lanterns gutter; when they relight, the rooftop is empty.' },
  ],
};

export function endingFor(id: string): Line[] {
  return ENDINGS[id] ?? DEFAULT_ENDING;
}
