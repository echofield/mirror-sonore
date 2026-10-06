// Shared mutable state. Modules import these objects and mutate their fields;
// never reassign the exported bindings themselves.
import { DEFAULTS, DEFAULT_DIR } from './config.js';

// P: what the controls say. V: live values that ease toward P (so Auto changes glide).
export const P = { ...DEFAULTS };
export const V = { ...DEFAULTS };

// Accumulators that drive animation over time.
export const S = {
  t: 0, rot: 0, rotV: 0, drift: 0, tun: 0, jul: 0,
  hue: 0, hueT: 0, hueKick: 0,
  palPhase: 0, palTarget: 0,
  seed: Math.random() * 100, sliceSeed: 0, tiltPh: 0,
  poke: [0, 0, 9],   // holo ripple: x, y, age in seconds
  morph: 0,          // 1 right after a Morph transition, decays to 0
  pumpT: 9,          // seconds since the last kick, for the pump envelope
  echoT: 0           // seconds since the last tracer capture
};

// Pump style and length are the user's, like Beat/Pump/Flow: Auto never changes them.
export const PUMP = { style: 'Punch', len: '1/8' };

// Audio analysis results: envelopes (low/mid/high/lvl) and decaying hit impulses.
export const A = {
  low: 0, mid: 0, high: 0, lvl: 0,
  kick: 0, snare: 0, hat: 0, drop: 0, cut: 0,
  eFast: 0, eSlow: 0, lastDrop: -99, playT: 0,
  pk: [.2, .2, .2, .2]
};

export const BEAT = { iois: [], last: -9, period: .5, bpm: 0 };
export const AUTO = { on: true, bars: 4, armed: false, armedAt: 0, phraseStart: 0, trans: 'Morph' };
export const OUT = { fmt: '9:16', q: '720p', len: '15s', clips: 1 };
export const SESSION = { active: false, total: 1, done: 0, start: 0, cancel: false, stream: null };

// Per-frame uniform values computed by map.js.
export const U = {};

// Scalars and things that get replaced wholesale.
export const G = {
  clock: 0,            // seconds of playback (only advances while audio plays)
  easeTau: .08,        // how fast V follows P; Auto raises it for gliding changes
  dir: DEFAULT_DIR,
  pal: [[0, 0, 0], [.3, .3, .3], [.6, .6, .6], [1, 1, 1]],
  bg: [.043, .047, .07],
  picturePal: null,    // { rgb: [[r,g,b]×4], css: 'linear-gradient(...)' } from the loaded image
  reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  W: 720, H: 1280,     // output size (what gets recorded)
  scale: 1,            // preview render scale (adaptive; forced to 1 while recording)
  imgAspect: 1,
  trip: null,          // active trip name, or null
  echoRate: '1/16',    // tracer refresh, in notes (see ECHO_RATES)
  journey: true,       // Journey arc: trip intensity builds, peaks and settles over each clip
  arcT: 0,             // seconds of playback for the Journey wave when not recording
  arc: 1,              // current Journey intensity (0.5–1)
  recT: -1, recLen: 0  // position inside the clip being recorded (-1 when not recording)
};
