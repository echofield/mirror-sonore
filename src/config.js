// Static configuration: modes, color directions, fader definitions, export options.
// Everything the user can pick lives here, so adding a mode or a direction starts in this file.

export const MODES = ['Mirror', 'Kaleido', 'Tunnel', 'Liquid', 'Holo', 'Fractal', 'Infinite'];
// Modes that use the "Folds" fader (angular symmetry count).
export const FOLD_MODES = [1, 2, 6];
export const HOLO = 4;

// A direction is a color world plus the modes Auto/Shuffle may pick inside it.
// pal: 4 colors dark → light, used as a gradient map and cycled on the beat.
// mix: default strength of the palette over the image's own colors (0 = untouched).
// Picture builds its palette from the loaded image at runtime (see image/palette.js).
export const DIRS = {
  Picture:  { pal: null, mix: .75, modes: [1, 6, 0, 3, 5, 2, 4], grain: .28, glow: .35, color: .35 },
  Original: { pal: ['#0b0c12', '#4a4d5c', '#a9a6b6', '#f4efe6'], mix: 0, modes: [1, 0, 6, 3, 5, 2], grain: .26, glow: .3, color: .25,
              sw: 'conic-gradient(#ff4fa3,#ffaa3c,#3fd7c6,#7a5cff,#ff4fa3)' },
  Neon:     { pal: ['#07040f', '#5d17ff', '#ff2fa8', '#2de2ff'], mix: .82, modes: [1, 2, 6, 5, 3, 0], grain: .28, glow: .6, color: .5 },
  Holo:     { pal: ['#0b0c12', '#7fd6ff', '#ff9de2', '#fff3b0'], mix: .2, modes: [4, 4, 5, 1, 6], grain: .345, glow: .2, color: .35 },
  Gold:     { pal: ['#050403', '#5a2a06', '#e8a032', '#fff3cf'], mix: .95, modes: [1, 0, 5, 6, 4], grain: .32, glow: .5, color: .3 },
  Ink:      { pal: ['#050506', '#26262b', '#b9b3a7', '#f4efe6'], mix: 1, modes: [0, 3, 5, 0, 6], grain: .6, glow: .08, color: .12 },
  Dream:    { pal: ['#160c28', '#8a5cff', '#ffb3d9', '#d2f6ff'], mix: .75, modes: [3, 6, 1, 4, 0], grain: .25, glow: .45, color: .45, soft: true },
  Ember:    { pal: ['#030101', '#7a0d02', '#ff4a12', '#ffd27a'], mix: .85, modes: [2, 6, 1, 5, 3], grain: .35, glow: .6, color: .4 }
};
export const DEFAULT_DIR = 'Picture';

// Trips: art presets built on how people describe the visuals of each substance in research and
// trip-report catalogues (Klüver's form constants, tracers, breathing surfaces, color enhancement,
// hyperspace geometry). Each sets a palette, the modes Auto may pick, the trip layer (geometry,
// tracers, breathing), the look and a pump style. Beat/Pump/Flow amounts stay the user's.
export const TRIPS = {
  LSD: {
    pal: ['#080414', '#ff2fa8', '#ffd23a', '#2de2ff'], mix: .8,
    modes: [1, 6, 1, 2, 0], pump: 'Punch', echoRate: '1/16',
    fx: { lattice: .45, latScale: 11, latWarp: 0.6, echo: .55, breath: .3 },
    look: { punch: .7, glitch: .3, warp: .3, trails: .35, spin: .3, zoom: 1, seg: 8 },
    tex: { grain: .22, glow: .55, color: .7 },
    desc: 'Crisp geometry laid over everything, electric color that keeps shifting, and stuttering tracers behind every move.'
  },
  Psilocybin: {
    pal: ['#0b0a06', '#3f6b2a', '#d9a441', '#9fe3d1'], mix: .7,
    modes: [3, 0, 1, 6], pump: 'Breathe', echoRate: '1/8', soft: true,
    fx: { lattice: .18, latScale: 7, latWarp: 0.45, echo: .2, breath: .85 },
    look: { punch: .4, glitch: .1, warp: .55, trails: .7, spin: .08, zoom: .95, seg: 6 },
    tex: { grain: .3, glow: .4, color: .35 },
    desc: 'Surfaces breathe and melt, earthy colors glow from inside, soft organic patterns come and go.'
  },
  DMT: {
    pal: ['#05020f', '#7a1cff', '#00e0c6', '#ffcf3f'], mix: .9,
    modes: [5, 6, 1, 2], pump: 'Punch', echoRate: '1/16',
    fx: { lattice: .65, latScale: 16, latWarp: 1, echo: .35, breath: .4 },
    look: { punch: .85, glitch: .45, warp: .2, trails: .4, spin: .4, zoom: 1.05, seg: 12 },
    tex: { grain: .2, glow: .7, color: .85 },
    desc: 'Hyperspace: dense jewel-colored geometry, fractal tunnels and color that never sits still.'
  },
  Mescaline: {
    pal: ['#120604', '#b8321a', '#f2b134', '#6ad0e8'], mix: .85,
    modes: [1, 2, 6, 0], pump: 'Breathe', echoRate: '1/8', soft: true,
    fx: { lattice: .55, latScale: 8, latWarp: 0.25, echo: .25, breath: .45 },
    look: { punch: .45, glitch: .15, warp: .2, trails: .5, spin: .12, zoom: 1, seg: 6 },
    tex: { grain: .28, glow: .45, color: .4 },
    desc: 'The original form constants: bold lattices, tunnels and spirals in saturated desert colors, slow and steady.'
  },
  Ayahuasca: {
    pal: ['#020805', '#0f5c3a', '#c9a227', '#e84d8a'], mix: .85,
    modes: [6, 3, 1, 5], pump: 'Breathe', echoRate: '1/8', soft: true,
    fx: { lattice: .3, latScale: 9, latWarp: 0.8, echo: .3, breath: .7 },
    look: { punch: .45, glitch: .1, warp: .45, trails: .65, spin: .2, zoom: 1, seg: 5 },
    tex: { grain: .3, glow: .5, color: .45 },
    desc: 'Deep jungle colors, serpent-like spirals and slow liquid waves.'
  },
  Ketamine: {
    pal: ['#030407', '#2b3446', '#8fa3b8', '#e8f0f7'], mix: .9,
    modes: [2, 6, 0, 3], pump: 'Duck', echoRate: '1/4',
    fx: { lattice: .05, latScale: 6, latWarp: 1, echo: .6, breath: .25 },
    look: { punch: .5, glitch: .7, warp: .3, trails: .85, spin: .05, zoom: 1, seg: 4 },
    tex: { grain: .45, glow: .2, color: .12 },
    ranges: { trails: [.7, .9], glitch: [.5, .85], spin: [-.15, .15] },
    desc: 'Cold and detached: a long tunnel, the picture splitting into slices, heavy slow trails.'
  }
};
// Each trip also exists as a hidden direction so its palette and modes flow through the same code.
for (const [name, t] of Object.entries(TRIPS)) {
  DIRS[name] = { pal: t.pal, mix: t.mix, modes: t.modes, grain: t.tex.grain, glow: t.tex.glow, color: t.tex.color, soft: t.soft, hidden: true };
}
export const TRIP_NAMES = ['None', ...Object.keys(TRIPS)];
// Tracer refresh interval, in beats.
export const ECHO_RATES = { '1/16': .25, '1/8': .5, '1/4': 1 };

const pct = v => Math.round(v * 100) + '%';
const x2 = v => v.toFixed(2);

// Macros are the user's live intensity controls. Auto never changes them.
export const MACROS = [
  { k: 'beat', label: 'Beat', min: 0, max: 1.5, step: .01, fmt: pct, hint: 'Hits on kicks, snares and drops: glitch, color split, ripples, flashes' },
  { k: 'pump', label: 'Pump', min: 0, max: 1.5, step: .01, fmt: pct, hint: 'How much the kick pumps the picture, like sidechain in a mix' },
  { k: 'flow', label: 'Flow', min: 0, max: 1.5, step: .01, fmt: pct, hint: 'How much the music drives continuous motion' }
];
// Pump: the kick "sidechains" the picture. The envelope is 1 on each kick and recovers over a
// tempo-synced length (in beats). Duck = shrink and darken then swell back (classic sidechain),
// Punch = zoom in and brighten, Breathe = follow the bass smoothly, Off = no pumping at all.
export const PUMP_STYLES = ['Off', 'Duck', 'Punch', 'Breathe'];
export const PUMP_LENGTHS = { '1/16': .25, '1/8': .5, '1/4': 1, '1/2': 2 };
// The look's character. Auto and Shuffle rewrite these.
export const FEEL = [
  { k: 'punch',  label: 'Punch',  min: 0,  max: 1,   step: .01, fmt: pct },
  { k: 'glitch', label: 'Glitch', min: 0,  max: 1,   step: .01, fmt: pct },
  { k: 'warp',   label: 'Warp',   min: 0,  max: 1,   step: .01, fmt: pct },
  { k: 'trails', label: 'Trails', min: 0,  max: .95, step: .01, fmt: pct },
  { k: 'spin',   label: 'Spin',   min: -1, max: 1,   step: .01, fmt: v => (v > 0 ? '+' : '') + v.toFixed(2) },
  { k: 'zoom',   label: 'Zoom',   min: .5, max: 3,   step: .01, fmt: v => v.toFixed(2) + '×' }
];
export const TEX = [
  { k: 'palMix', label: 'Palette',    min: 0, max: 1, step: .01,  fmt: pct },
  { k: 'color',  label: 'Color flow', min: 0, max: 1, step: .01,  fmt: pct },
  { k: 'grain',  label: 'Grain',      min: 0, max: 1, step: .005, fmt: v => v.toFixed(3) },
  { k: 'glow',   label: 'Glow',       min: 0, max: 1, step: .01,  fmt: pct }
];
// Foil defaults follow the HoloCloth reference: holo .84, band freq 1.1, sparkle .73, noise .345.
export const FOIL = [
  { k: 'holo',    label: 'Holo',      min: 0,  max: 1, step: .01, fmt: x2 },
  { k: 'bands',   label: 'Bands',     min: .3, max: 3, step: .01, fmt: x2 },
  { k: 'sparkle', label: 'Sparkle',   min: 0,  max: 1, step: .01, fmt: x2 },
  { k: 'bump',    label: 'Scratches', min: 0,  max: 1, step: .01, fmt: x2 }
];

// The trip layer. Trips set these; the user can fine-tune them. Auto only varies the density.
export const TRIPFX = [
  { k: 'lattice',  label: 'Geometry',  min: 0, max: 1,  step: .01, fmt: pct },
  { k: 'latScale', label: 'Density',   min: 4, max: 24, step: .1,  fmt: v => v.toFixed(1) },
  { k: 'latWarp',  label: 'Funnel',    min: 0, max: 1,  step: .01, fmt: pct },
  { k: 'echo',     label: 'Tracers',   min: 0, max: 1,  step: .01, fmt: pct },
  { k: 'breath',   label: 'Breathing', min: 0, max: 1,  step: .01, fmt: pct }
];

// Every continuous parameter. V (live values) eases toward P (control values) for these keys.
export const KEYS = ['beat', 'pump', 'flow', 'punch', 'glitch', 'warp', 'trails', 'spin', 'zoom',
  'palMix', 'color', 'grain', 'glow', 'holo', 'bands', 'sparkle', 'bump', 'lattice', 'latScale', 'latWarp', 'echo', 'breath'];

export const DEFAULTS = {
  mode: 1, seg: 8,
  beat: .8, pump: .7, flow: 1,
  punch: .7, glitch: .35, warp: .25, trails: .45, spin: .22, zoom: .95,
  palMix: .75, color: .35, grain: .28, glow: .35,
  holo: .84, bands: 1.1, sparkle: .73, bump: .6,
  lattice: 0, latScale: 10, latWarp: .5, echo: 0, breath: 0
};

export const FORMATS = { '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
export const QUALS = { '720p': 720, '1080p': 1080 };
export const LENS = { '15s': 15, '30s': 30, '60s': 60, 'Full': 0 };
export const CLIPS = [1, 3, 5];
export const BARS = [4, 8, 16];
export const TRANSITIONS = ['Morph', 'Cut'];
