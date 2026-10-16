/** Global debug toggles (F1 hitboxes, F2 frame data, F3 profiler). Render/UI only. */
export const debugFlags = {
  hitboxes: false,
  frameData: false,
  profiler: false,
  inputDisplay: false,
};
export type DebugFlagKey = keyof typeof debugFlags;
