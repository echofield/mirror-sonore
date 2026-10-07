// Kept looks. A kept look is everything the controls say (trip, direction, mode and look, colour and texture,
// the trip layer, Beat/Pump/Flow, pump style, Auto) with a small picture of the moment it was kept. It does not hold the
// image or the sound, so a kept look can be laid over any picture.
// They live in this browser's storage. When storage is refused they last until the page closes.
import { DIRS, TRIPS, MODES, KEYS, DEFAULTS, MACROS, FEEL, TEX, FOIL, TRIPFX, WAVEFX, PUMP_STYLES, PUMP_LENGTHS, ECHO_RATES, BARS, TRANSITIONS } from './config.js';
import { P, G, S, PUMP, AUTO } from './state.js';
import { applyPalette, applyLook, setAuto } from './auto.js';

const STORE = 'miroir-sonore.kept.v1';
export const MAX_KEPT = 12;
export const KEPT = read();   // newest first

function read() {
  try {
    const a = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(a) ? a.filter(k => k && k.id && k.p && DIRS[k.dir]).slice(0, MAX_KEPT) : [];
  } catch (e) { return []; }
}
function write() { try { localStorage.setItem(STORE, JSON.stringify(KEPT)); return true; } catch (e) { return false; } }

function thumbOf(canvas) {
  try {
    const w = 108, h = Math.round(w * canvas.height / canvas.width), c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const u = c.toDataURL('image/jpeg', .72);
    return typeof u === 'string' && u.indexOf('data:image') === 0 ? u : '';
  } catch (e) { return ''; }
}

// Returns { item, dropped (the oldest one made room), stored (false when the browser refused to save) }.
export function keepLook(canvas) {
  const p = { mode: P.mode, seg: P.seg };
  KEYS.forEach(k => { p[k] = +P[k].toFixed(4); });
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: (G.trip && G.dir !== G.trip ? G.trip + ' · ' : '') + G.dir + ' · ' + MODES[P.mode], dir: G.dir, p,
    trip: G.trip, echoRate: G.echoRate, journey: G.journey,
    pump: { style: PUMP.style, len: PUMP.len },
    auto: { on: AUTO.on, bars: AUTO.bars, trans: AUTO.trans },
    thumb: thumbOf(canvas)
  };
  KEPT.unshift(item);
  const dropped = KEPT.length > MAX_KEPT;
  if (dropped) KEPT.length = MAX_KEPT;
  return { item, dropped, stored: write() };
}

export function removeKept(id) {
  const i = KEPT.findIndex(k => k.id === id);
  if (i < 0) return null;
  const item = KEPT.splice(i, 1)[0];
  write();
  return { item, i };
}
export function restoreKept(r) {
  if (!r || KEPT.some(k => k.id === r.item.id)) return;
  KEPT.splice(Math.min(r.i, KEPT.length), 0, r.item);
  if (KEPT.length > MAX_KEPT) KEPT.length = MAX_KEPT;
  write();
}

// Bring a kept look back. Every value is checked against today's controls, so an entry kept by an
// older version (or a damaged one) cannot put the page in a state the faders cannot reach.
const RANGE = {};
[MACROS, FEEL, TEX, FOIL, TRIPFX, WAVEFX].forEach(defs => defs.forEach(d => { RANGE[d.k] = d; }));
const num = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;

export function applyKept(k) {
  const L = { mode: Math.round(num(k.p.mode, DEFAULTS.mode, 0, MODES.length - 1)), seg: Math.round(num(k.p.seg, DEFAULTS.seg, 2, 16)) };
  KEYS.forEach(key => { L[key] = num(k.p[key], DEFAULTS[key], RANGE[key].min, RANGE[key].max); });
  if (k.pump && PUMP_STYLES.indexOf(k.pump.style) >= 0) PUMP.style = k.pump.style;
  if (k.pump && PUMP_LENGTHS[k.pump.len]) PUMP.len = k.pump.len;
  if (k.auto && BARS.indexOf(k.auto.bars) >= 0) AUTO.bars = k.auto.bars;
  if (k.auto && TRANSITIONS.indexOf(k.auto.trans) >= 0) AUTO.trans = k.auto.trans;
  G.trip = TRIPS[k.trip] ? k.trip : null;
  if (ECHO_RATES[k.echoRate]) G.echoRate = k.echoRate;
  if (typeof k.journey === 'boolean') G.journey = k.journey;
  G.dir = k.dir;
  applyPalette();
  S.hueKick = 0;
  applyLook(L, 'shuffle');             // dissolves or cuts, as Transition says
  setAuto(!!(k.auto && k.auto.on));    // also redraws every control
}
