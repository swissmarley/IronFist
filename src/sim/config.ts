export interface ArenaDef {
  id: string;
  name: string;
  /** Half extents of the playable floor in mm. */
  halfX: number;
  halfZ: number;
  /** Walls: fighters stop at the boundary. Open: fighters fall off (ring-out). */
  walls: boolean;
}

export interface MatchConfig {
  roundsToWin: number;      // 1..5
  roundTimeSec: number;     // 0 = infinite
  startDistance: number;    // mm between fighters
  arena: ArenaDef;
  /** Training mode: no rounds, hp regenerates when idle. */
  training: boolean;
  seed: number;
}

export const DEFAULT_ARENA: ArenaDef = { id: 'greybox', name: 'Grey Box', halfX: 7000, halfZ: 7000, walls: true };

export const DEFAULT_MATCH: MatchConfig = {
  roundsToWin: 3,
  roundTimeSec: 60,
  startDistance: 1800,
  arena: DEFAULT_ARENA,
  training: false,
  seed: 1,
};

/** Shared tuning constants (frames, mm, percent). */
export const TUNING = {
  tapWindow: 4,            // frames: up/down released within this = sidestep
  jumpHoldFrames: 5,       // frames of holding up before a jump starts
  crouchHurtDelay: 2,      // frames after crouching before highs whiff
  standUpFrames: 3,
  wsWindow: 8,
  landingFrames: 4,
  defaultBuffer: 8,
  hitstopLight: 4,
  hitstopMedium: 7,
  hitstopHeavy: 10,
  hitstopLaunch: 12,
  hitstopWall: 14,
  chDamagePct: 125,
  pushFrames: 8,
  minSeparation: 0,         // computed from push radii
  lyingFrames: 40,          // frames before auto get-up
  getupFrames: 24,
  scaling: [100, 100, 80, 70, 60, 50, 50, 40, 40, 30],
  scalingFloor: 30,
  liftDecayPct: 85,         // each air hit keeps this % of lift
  airMinLift: 12,
  groundHitPct: 70,
  wallSplatFrames: 32,
  techWindow: 10,
  throwBreakWindow: 14,
  koSlowmoFrames: 90,
  roundStartFrames: 100,
  roundEndFrames: 150,
} as const;
