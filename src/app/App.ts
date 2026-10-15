import type { Game } from './Game';
import { MenuInput, type MenuAction } from '@/input/MenuInput';
import { MatchRunner } from './MatchRunner';
import type { AfterMatch, MatchSetup, Mode } from './modes/types';
import { ArcadeMode, buildLadder } from './modes/Arcade';
import { PracticeMode, SurvivalMode, TimeAttackMode, VersusMode } from './modes/Simple';
import { CHARACTERS, getCharacter } from '@/data/characters';
import { STAGE_IDS } from '@/render/stages';
import { TitleScreen } from '@/ui/screens/TitleScreen';
import { MainMenu, type MainMenuChoice } from '@/ui/screens/MainMenu';
import { CharacterSelect } from '@/ui/screens/CharacterSelect';
import { StageSelect } from '@/ui/screens/StageSelect';
import { CutsceneOverlay, LoadingScreen, VersusSplash } from '@/ui/screens/Overlays';
import { ResultsScreen } from '@/ui/screens/ResultsScreen';
import { PauseMenu } from '@/ui/screens/PauseMenu';
import { MoveListScreen } from '@/ui/screens/MoveListScreen';
import { PracticeMenu } from '@/ui/screens/PracticeMenu';
import { ReplayList } from '@/ui/screens/ReplayList';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import type { Screen } from '@/ui/Screen';
import { deleteKey, listKeys, loadKey, saveKey } from './storage';
import { deserializeReplay, serializeReplay, type Replay } from '@/sim/replay';
import { loadRecords, saveRecords, type Records } from './settings';
import { PracticeController } from './PracticeController';
import { IN_START } from '@/input/InputFrame';
import { notationToFrames } from '@/ai/BasicAI';

type State = 'title' | 'menu' | 'select' | 'stage' | 'loading' | 'cutscene' | 'match' | 'paused' | 'movelist' | 'practiceMenu' | 'results' | 'replays' | 'settings' | 'ending';

/** Application flow: screens, modes and the match runner. Implements the loop driver. */
export class App {
  private state: State = 'title';
  private readonly menu = new MenuInput();
  private readonly screens: Record<string, Screen>;
  private readonly title: TitleScreen;
  private readonly main: MainMenu;
  private readonly select: CharacterSelect;
  private readonly stageSel: StageSelect;
  private readonly splash: VersusSplash;
  private readonly loading: LoadingScreen;
  private readonly cutscene: CutsceneOverlay;
  private readonly results: ResultsScreen;
  private readonly pause: PauseMenu;
  private readonly moveList: MoveListScreen;
  private readonly practiceMenu: PracticeMenu;
  private readonly replays: ReplayList;
  private readonly settings: SettingsScreen;
  private mode: Mode | null = null;
  private runner: MatchRunner | null = null;
  private pendingChoice: MainMenuChoice = 'versus';
  private picked: { p1: string; p2: string } = { p1: 'greybox', p2: 'greybox' };
  private records: Records | null = null;
  private practice: PracticeController | null = null;
  private cutsceneLines: { speaker: string; line: string }[] = [];
  private cutsceneIdx = 0;
  private cutsceneTimer = 0;
  private afterCutscene: (() => void) | null = null;
  private frameCounter = 0;
  readonly roster = Object.values(CHARACTERS).filter((c) => c.id !== 'greybox');

  constructor(private readonly game: Game, uiRoot: HTMLElement) {
    if (this.roster.length === 0) this.roster.push(getCharacter('greybox'));
    this.title = new TitleScreen(uiRoot);
    this.main = new MainMenu(uiRoot);
    this.select = new CharacterSelect(uiRoot, this.roster);
    this.stageSel = new StageSelect(uiRoot, STAGE_IDS.filter((id) => id !== 'greybox').map((id) => ({ id, name: id, kind: 'walls' })));
    this.splash = new VersusSplash(uiRoot);
    this.loading = new LoadingScreen(uiRoot);
    this.cutscene = new CutsceneOverlay(uiRoot);
    this.results = new ResultsScreen(uiRoot);
    this.pause = new PauseMenu(uiRoot);
    this.moveList = new MoveListScreen(uiRoot);
    this.practiceMenu = new PracticeMenu(uiRoot);
    this.replays = new ReplayList(uiRoot);
    this.settings = new SettingsScreen(uiRoot, game.settings);
    this.screens = { title: this.title, menu: this.main, select: this.select, stage: this.stageSel, loading: this.loading, cutscene: this.cutscene, results: this.results, paused: this.pause, movelist: this.moveList, practiceMenu: this.practiceMenu, replays: this.replays, settings: this.settings, ending: this.cutscene };
    this.wire();
    void loadRecords().then((r) => { this.records = r; });
  }

  private wire(): void {
    const ui = (kind: 'move' | 'confirm' | 'back'): void => { this.game.audio.engine.play(kind === 'move' ? 'ui_move' : kind === 'confirm' ? 'ui_confirm' : 'ui_back'); };
    this.title.onStart = () => { ui('confirm'); this.go('menu'); };
    this.main.list.onSound = ui;
    this.main.onChoose = (c) => this.chooseMode(c);
    this.select.onSound = ui;
    this.select.onBack = () => this.go('menu');
    this.select.onDone = (r) => { this.picked = r; if (this.pendingChoice === 'versus') this.go('stage'); else void this.startMode(); };
    this.stageSel.list.onSound = ui;
    this.stageSel.onBack = () => this.go('select');
    this.stageSel.onChoose = (id) => { this.chosenStage = id; void this.startMode(); };
    this.results.list.onSound = ui;
    this.results.onChoose = (c) => this.onResultsChoice(c);
    this.pause.list.onSound = ui;
    this.pause.onChoose = (c) => this.onPauseChoice(c);
    this.moveList.onBack = () => this.go(this.runner ? 'paused' : 'menu');
    this.moveList.onDemo = (m) => { if (this.practice && this.runner) { const f = notationToFrames(m.input, true); if (f) this.game.input.enqueueScript(0, f); this.resume(); } };
    this.practiceMenu.list.onSound = ui;
    this.practiceMenu.onBack = () => this.go('paused');
    this.practiceMenu.onChange = (o) => this.practice?.apply(o);
    this.replays.list.onSound = ui;
    this.replays.onBack = () => this.go('menu');
    this.replays.onPlay = (key) => void this.playReplay(key);
    this.replays.onDelete = (key) => void deleteKey(key).then(() => this.refreshReplays());
    this.settings.list.onSound = ui;
    this.settings.onBack = () => this.go(this.runner ? 'paused' : 'menu');
    this.cutscene.onSkip = () => this.endCutscene();
  }

  private chosenStage = 'random';
  /** Whether practice sessions attach the dummy controller (menu practice: yes; ?mode=training: no). */
  private practiceDummy = true;

  private go(state: State): void {
    for (const s of Object.values(this.screens)) s.hide();
    this.state = state;
    const screen = this.screens[state];
    if (screen) screen.show();
    if (state === 'menu') this.game.audio.setTheme('menu');
    if (state === 'replays') void this.refreshReplays();
    const f = this.game.input.frames;
    this.menu.prime([f[0] ?? 0, f[1] ?? 0]);
  }

  private chooseMode(c: MainMenuChoice): void {
    this.pendingChoice = c;
    switch (c) {
      case 'settings': this.go('settings'); break;
      case 'replays': this.go('replays'); break;
      default: this.select.start(c === 'versus' ? 2 : 1); this.state = 'select';
    }
  }

  private async startMode(): Promise<void> {
    const s = this.game.settings.get();
    const stages = STAGE_IDS.filter((id) => id !== 'greybox');
    const rosterIds = this.roster.map((r) => r.id);
    const seed = (Date.now() % 100000) | 1;
    const stage = this.chosenStage === 'random' ? (stages[seed % Math.max(1, stages.length)] ?? 'dojo') : this.chosenStage;
    this.practiceDummy = true;
    switch (this.pendingChoice) {
      case 'arcade': this.mode = new ArcadeMode({ player: this.picked.p1, roster: rosterIds, stages, difficulty: s.difficulty, rounds: s.rounds, roundTime: s.roundTime, seed }); break;
      case 'timeattack': this.mode = new TimeAttackMode(buildLadder({ player: this.picked.p1, roster: rosterIds, stages, difficulty: s.difficulty, rounds: 1, roundTime: 60, seed })); break;
      case 'survival': this.mode = new SurvivalMode(this.picked.p1, rosterIds, stages, s.difficulty, seed); break;
      case 'practice': this.mode = new PracticeMode({ p1: this.picked.p1, p2: this.picked.p2, stage, config: { training: true, seed }, cpu: [null, null] }); break;
      default: this.mode = new VersusMode({ p1: this.picked.p1, p2: this.picked.p2, stage, config: { roundsToWin: s.rounds, roundTimeSec: s.roundTime, seed }, cpu: [null, null] });
    }
    await this.playNext();
  }

  private async playNext(): Promise<void> {
    const setup = this.mode?.next();
    if (!setup) { this.go('menu'); return; }
    if (setup.intro) { this.runCutscene(setup.intro, () => void this.launch(setup)); return; }
    await this.launch(setup);
  }

  private async launch(setup: MatchSetup): Promise<void> {
    this.endMatch();
    this.go('loading');
    this.splash.set(getCharacter(setup.p1).name, getCharacter(setup.p2).name, setup.stage.toUpperCase());
    await this.game.loadStage(setup.stage);
    this.runner = new MatchRunner(this.game, setup);
    if (this.mode?.id === 'practice' && this.practiceDummy) { this.practice = new PracticeController(this.game, this.runner); this.practice.apply(this.practiceMenu.options); }
    this.go('match');
    this.splash.show();
    this.frameCounter = 0;
  }

  private endMatch(): void {
    this.practice?.dispose(); this.practice = null;
    this.runner?.dispose(); this.runner = null;
  }

  private runCutscene(lines: { speaker: string; line: string }[], after: () => void, ending = false): void {
    this.cutsceneLines = lines; this.cutsceneIdx = 0; this.cutsceneTimer = 0; this.afterCutscene = after;
    this.go(ending ? 'ending' : 'cutscene');
    const l = lines[0];
    if (l) this.cutscene.say(l.line, l.speaker);
  }

  private endCutscene(): void {
    const after = this.afterCutscene; this.afterCutscene = null;
    this.cutscene.hide();
    after?.();
  }

  private finishMatch(): void {
    if (!this.runner || !this.mode) return;
    const outcome = this.runner.outcome();
    const after: AfterMatch = this.mode.onEnd(outcome);
    void this.saveReplay(this.runner.replay());
    void this.updateRecords(outcome);
    if (after.kind === 'next') { void this.playNext(); return; }
    if (after.kind === 'ending') { this.runCutscene(after.lines, () => { this.endMatch(); this.go('menu'); }, true); return; }
    if (after.kind === 'menu') { this.endMatch(); this.go('menu'); return; }
    const winnerName = outcome.winner === 2 ? 'DRAW' : getCharacter(outcome.winner === 0 ? this.runner.setup.p1 : this.runner.setup.p2).name;
    this.results.set({ winner: winnerName, wins: outcome.wins, maxCombo: outcome.maxCombo, damage: outcome.damage, timeSec: outcome.frames / 60 }, after.choices);
    this.go('results');
  }

  private onResultsChoice(c: string): void {
    this.mode?.onChoice?.(c);
    if (c === 'menu') { this.endMatch(); this.go('menu'); return; }
    if (c === 'select') { this.endMatch(); this.select.start(this.pendingChoice === 'versus' ? 2 : 1); this.state = 'select'; return; }
    void this.playNext();
  }

  private onPauseChoice(c: string): void {
    switch (c) {
      case 'resume': this.resume(); break;
      case 'movelist': if (this.runner) { this.moveList.setCharacter(getCharacter(this.runner.setup.p1)); this.go('movelist'); } break;
      case 'practice': this.go('practiceMenu'); break;
      case 'settings': this.go('settings'); break;
      case 'restart': if (this.runner) { if (this.practice) this.practice.reset(); else this.runner.session.sim.rematch(); } this.resume(); break;
      case 'quit': this.endMatch(); this.mode = null; this.go('menu'); break;
    }
  }

  private resume(): void {
    for (const s of Object.values(this.screens)) s.hide();
    if (this.runner) { this.runner.paused = false; this.state = 'match'; }
    this.menu.reset();
  }

  private async saveReplay(r: Replay): Promise<void> {
    const key = `replay:${Date.now()}`;
    await saveKey(key, serializeReplay(r));
    const keys = (await listKeys('replay:')).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 12))) await deleteKey(k);
  }

  private async refreshReplays(): Promise<void> {
    const keys = (await listKeys('replay:')).sort().reverse();
    const entries = [];
    for (const k of keys) {
      const raw = await loadKey<string | null>(k, null);
      if (!raw) continue;
      try { const r = deserializeReplay(raw); entries.push({ key: k, label: `${new Date(parseInt(k.slice(7), 10)).toLocaleString()}  ${r.chars[0].toUpperCase()} vs ${r.chars[1].toUpperCase()}  (${Math.round(r.inputs.length / 120)}s)` }); } catch { /* skip corrupt */ }
    }
    this.replays.setEntries(entries);
  }

  private async playReplay(key: string): Promise<void> {
    const raw = await loadKey<string | null>(key, null);
    if (!raw) return;
    const r = deserializeReplay(raw);
    this.mode = { id: 'replay', next: () => null, onEnd: () => ({ kind: 'menu' }) };
    const setup: MatchSetup = { p1: r.chars[0], p2: r.chars[1], stage: (r.config.arena?.id as string | undefined) ?? 'dojo', config: r.config, cpu: [null, null], label: 'REPLAY  ·  2/4: exit' };
    await this.launch(setup);
    if (this.runner) this.runner.playback = r;
  }

  private async updateRecords(outcome: { winner: number }): Promise<void> {
    if (!this.records || !this.runner) return;
    this.records.matchesPlayed++;
    if (this.mode instanceof ArcadeMode && outcome.winner === 0 && this.mode.stageIndex >= 8) this.records.arcadeClears[this.runner.setup.p1] = (this.records.arcadeClears[this.runner.setup.p1] ?? 0) + 1;
    if (this.mode instanceof SurvivalMode) this.records.survivalBest[this.runner.setup.p1] = Math.max(this.records.survivalBest[this.runner.setup.p1] ?? 0, this.mode.wins);
    if (this.mode instanceof TimeAttackMode && this.mode.next() === null) { const ms = Math.round(this.mode.totalFrames * 1000 / 60); const prev = this.records.timeAttackBest[this.runner.setup.p1]; if (!prev || ms < prev) this.records.timeAttackBest[this.runner.setup.p1] = ms; }
    await saveRecords(this.records);
  }

  /** Skip menus (tests / dev): start a session immediately. */
  async quickStart(mode: string, p1: string, p2: string, stage: string, config: MatchSetup['config'], cpu: [number | null, number | null]): Promise<void> {
    this.pendingChoice = mode === 'practice' || mode === 'training' ? 'practice' : 'versus';
    this.practiceDummy = mode === 'practice';
    this.mode = mode === 'practice' || mode === 'training' ? new PracticeMode({ p1, p2, stage, config: { training: true, ...config }, cpu }) : new VersusMode({ p1, p2, stage, config, cpu });
    await this.playNext();
    this.splash.hide();
  }

  showTitle(): void { this.go('title'); }

  /** Monotonic loop-tick probe (advances in menus, during pause and in slow motion). */
  frame(): number { return this.frameCounter; }

  get currentRunner(): MatchRunner | null { return this.runner; }
  get currentState(): State { return this.state; }

  // --- loop driver ---------------------------------------------------------
  sampleInput(): void {
    if (this.state === 'match' && this.runner) { this.runner.sampleInput(); return; }
    const f = this.game.input.sample();
    this.menu.push([f[0] ?? 0, f[1] ?? 0]);
  }

  step(): void {
    this.frameCounter++;
    if (this.state === 'match' && this.runner) {
      if (this.runner.session.sim.frame === 90) this.splash.hide();
      const inputs = this.game.input.frames;
      const startPressed = ((inputs[0] ?? 0) | (inputs[1] ?? 0)) & IN_START;
      if (startPressed && !this.startHeld && this.runner.session.sim.frame > 30 && !this.runner.playback) { this.startHeld = true; this.openPause(); return; }
      this.startHeld = startPressed !== 0;
      if (this.runner.playback && (((inputs[0] ?? 0) | (inputs[1] ?? 0)) & 0xa0)) { this.endMatch(); this.mode = null; this.go('menu'); return; }
      if (this.runner.step()) this.finishMatch();
      return;
    }
    if (this.state === 'cutscene' || this.state === 'ending') {
      this.cutsceneTimer++;
      if (this.cutsceneTimer > 240) { this.cutsceneTimer = 0; this.cutsceneIdx++; const l = this.cutsceneLines[this.cutsceneIdx]; if (l) this.cutscene.say(l.line, l.speaker); else this.endCutscene(); }
    }
    for (const a of this.menu.drain()) this.dispatch(a.player, a.action);
  }

  private startHeld = false;

  private openPause(): void {
    if (!this.runner) return;
    this.runner.paused = true;
    this.pause.configure(this.mode?.id === 'practice');
    this.go('paused');
  }

  private dispatch(player: number, action: MenuAction): void {
    const screen = this.screens[this.state];
    if (!screen) return;
    if (this.state === 'select' || this.state === 'results' || this.state === 'menu' || this.state === 'stage' || this.state === 'title') screen.handle(player, action);
    else screen.handle(player, action);
  }

  render(alpha: number, dtMs: number): void {
    if (this.runner) this.runner.session.render(alpha, dtMs, this.game.renderer);
    else this.game.renderScene();
    const screen = this.screens[this.state];
    screen?.update(dtMs);
  }
}
