// Looks, directions and the Auto engine.
// A "look" is a mode plus character params (punch, glitch, warp, trails, spin, zoom).
// Auto picks a new look inside the current direction on a kick every N bars, and on drops.
// Transitions: Morph dissolves through the feedback buffer and glides params; Cut snaps on the beat with a flash.
import { DIRS } from './config.js';
import { P, S, A, G, AUTO, BEAT } from './state.js';
import { syncUI, setAutoUI } from './ui.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a = 0, b = 1) => v < a ? a : (v > b ? b : v);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export function lookFor(name, o = {}) {
  const D = DIRS[name], soft = !!D.soft;
  const modes = D.modes;
  let mode = o.signature ? modes[0] : pick(modes);
  if ((o.change && Math.random() < .65) || o.big) {
    const others = modes.filter(m => m !== P.mode);
    if (others.length) mode = pick(others);
  }
  const sig = o.signature;
  const L = {
    mode, seg: pick([3, 4, 5, 6, 6, 8, 8, 10, 12]),
    punch:  sig ? (soft ? .4 : .7)  : (soft ? rnd(.25, .5) : rnd(.5, .95)),
    glitch: sig ? (soft ? .12 : .35) : (soft ? rnd(0, .25) : rnd(.1, .65)),
    warp:   sig ? .25 : rnd(.1, .75),
    trails: sig ? (soft ? .75 : .45) : (soft ? rnd(.6, .9) : rnd(.2, .8)),
    spin:   sig ? .22 : rnd(-.6, .6) * (soft ? .4 : 1),
    zoom:   sig ? .95 : rnd(.8, 1.9)
  };
  if (mode === 4) { L.trails = Math.min(L.trails, .3); L.zoom = sig ? 1 : rnd(.9, 1.2); L.spin *= .25; L.warp = Math.max(L.warp, .35); }
  if (mode === 5) { L.zoom = sig ? 1 : rnd(.8, 1.4); L.warp = Math.min(L.warp, .3); }
  if (mode === 6) { L.zoom = sig ? 1 : rnd(.8, 1.3); }
  if (o.full) { L.grain = clamp(D.grain + rnd(-.08, .08)); L.glow = clamp(D.glow + rnd(-.15, .15)); L.bands = rnd(.7, 1.8); }
  return L;
}

// how: 'auto' (beat-synced, uses the chosen transition), 'shuffle', or 'user' (direct, no transition).
export function applyLook(L, how) {
  const modeChanged = L.mode !== undefined && L.mode !== P.mode;
  Object.keys(L).forEach(k => { P[k] = L[k]; });
  if (how === 'user') { G.easeTau = .1; }
  else if (AUTO.trans === 'Morph') { G.easeTau = .9; S.morph = 1; A.cut = Math.max(A.cut, .2); }
  else { G.easeTau = .15; A.cut = 1; S.seed = Math.random() * 100; S.drift += rnd(3, 12); }
  if (how !== 'user' && modeChanged && AUTO.trans === 'Morph') S.drift += rnd(.3, 1);
  syncUI();
}

export function applyPalette() {
  const D = DIRS[G.dir];
  if (G.dir === 'Picture') G.pal = G.picturePal ? G.picturePal.rgb : DIRS.Neon.pal.map(hex);
  else G.pal = D.pal.map(hex);
  G.bg = (G.dir === 'Original' || G.dir === 'Picture') ? hex('#0b0c12') : G.pal[0];
}

export function setDirection(name) {
  G.dir = name;
  applyPalette();
  const D = DIRS[name];
  const L = lookFor(name, { signature: true });
  Object.assign(L, { palMix: D.mix, grain: D.grain, glow: D.glow, color: D.color });
  if (name === 'Holo') Object.assign(L, { holo: .84, bands: 1.1, sparkle: .73, bump: .6 });
  S.hueKick = 0;
  applyLook(L, AUTO.on ? 'shuffle' : 'user');
}

export function setMode(i) {
  P.mode = i;
  if (AUTO.on) setAuto(false);
  S.morph = .6;          // a short dissolve even for manual mode changes
  syncUI();
}

export function shuffle() {
  applyLook(lookFor(G.dir, { change: true, full: true }), 'shuffle');
}

export function setAuto(on) {
  AUTO.on = on; AUTO.armed = false; AUTO.phraseStart = G.clock;
  setAutoUI();
}

function autoChange(big) {
  AUTO.armed = false; AUTO.phraseStart = G.clock;
  applyLook(lookFor(G.dir, { change: true, big }), 'auto');
}
export function autoTick(playing) {
  if (!AUTO.on || !playing) return;
  const len = AUTO.bars * 4 * BEAT.period;
  if (!AUTO.armed && G.clock - AUTO.phraseStart >= len) { AUTO.armed = true; AUTO.armedAt = G.clock; }
  if (AUTO.armed && G.clock - AUTO.armedAt > 1.2) autoChange(false);   // no kick came: change anyway
}
export function autoOnKick() { if (AUTO.on && AUTO.armed) autoChange(false); }
export function autoOnDrop() { if (AUTO.on && G.clock - AUTO.phraseStart > 2) autoChange(true); }
