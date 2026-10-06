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

const pct = v => Math.round(v * 100) + '%';
const x2 = v => v.toFixed(2);

// Macros are the user's live intensity controls. Auto never changes them.
export const MACROS = [
  { k: 'beat', label: 'Beat', min: 0, max: 1.5, step: .01, fmt: pct, hint: 'Strength of hits on kicks, snares and drops' },
  { k: 'flow', label: 'Flow', min: 0, max: 1.5, step: .01, fmt: pct, hint: 'How much the music drives continuous motion' }
];
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

// Every continuous parameter. V (live values) eases toward P (control values) for these keys.
export const KEYS = ['beat', 'flow', 'punch', 'glitch', 'warp', 'trails', 'spin', 'zoom',
  'palMix', 'color', 'grain', 'glow', 'holo', 'bands', 'sparkle', 'bump'];

export const DEFAULTS = {
  mode: 1, seg: 8,
  beat: .8, flow: 1,
  punch: .7, glitch: .35, warp: .25, trails: .45, spin: .22, zoom: .95,
  palMix: .75, color: .35, grain: .28, glow: .35,
  holo: .84, bands: 1.1, sparkle: .73, bump: .6
};

export const FORMATS = { '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
export const QUALS = { '720p': 720, '1080p': 1080 };
export const LENS = { '15s': 15, '30s': 30, '60s': 60, 'Full': 0 };
export const CLIPS = [1, 3, 5];
export const BARS = [4, 8, 16];
export const TRANSITIONS = ['Morph', 'Cut'];
