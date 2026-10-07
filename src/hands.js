// The hands: play the picture. Dragging on it, or holding the arrow keys, pushes four offsets
// (spin, zoom, warp, trails) on top of whatever the look says. Letting go lets them spring back;
// with Latch they stay where they were left. Nothing here writes to P, so Auto keeps changing
// looks underneath, and a kept look does not hold the hands.
//   one finger (or the mouse):  sideways = spin, up/down = zoom
//   two fingers:                sideways = trails, up/down = warp
//   keys:                       arrows = spin and zoom, Shift + arrows = trails and warp
import { HAND } from './state.js';

const NAMES = ['spin', 'zoom', 'warp', 'trails'];
const ARROWS = { ArrowLeft: [-1, 'spin', 'trails'], ArrowRight: [1, 'spin', 'trails'], ArrowUp: [1, 'zoom', 'warp'], ArrowDown: [-1, 'zoom', 'warp'] };
const KEY_RATE = 1.15;            // a held key crosses the full range in a little under a second
const clamp1 = v => v < -1 ? -1 : (v > 1 ? 1 : v);
const keys = {};                  // held arrow → the name it drives
const pts = new Map();            // pointers on the picture
let base = { spin: 0, zoom: 0, warp: 0, trails: 0 };
let view = null, pad = null, onLatch = null, dragged = false, padOn = false;

function rebase() {
  base = { ...HAND.t };
  pts.forEach(p => { p.x0 = p.x; p.y0 = p.y; });
}

export function initHands(canvas, padEl, latchCb) {
  view = canvas; pad = padEl; onLatch = latchCb;
  view.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* not everywhere */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    rebase();
    if (pts.size === 1) dragged = false;
  });
  view.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    let dx = 0, dy = 0;
    pts.forEach(q => { dx += q.x - q.x0; dy += q.y - q.y0; });
    dx /= pts.size; dy /= pts.size;
    if (!dragged && Math.abs(dx) + Math.abs(dy) < 8) return;   // still a tap
    dragged = true;
    const r = view.getBoundingClientRect(), span = Math.max(60, Math.min(r.width, r.height) * .6);
    if (pts.size === 1) { HAND.t.spin = clamp1(base.spin + dx / span); HAND.t.zoom = clamp1(base.zoom - dy / span); }
    else { HAND.t.trails = clamp1(base.trails + dx / span); HAND.t.warp = clamp1(base.warp - dy / span); }
  });
  const up = e => { if (pts.delete(e.pointerId)) rebase(); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => view.addEventListener(t, up));
  window.addEventListener('blur', () => { Object.keys(keys).forEach(k => { delete keys[k]; }); pts.clear(); });
}

// True once after a drag, so the tap that plays and pauses does not also fire.
export function wasDrag() { const d = dragged; dragged = false; return d; }

// Returns true when the key belongs to the hands.
export function handKey(e, down) {
  const a = ARROWS[e.key];
  if (!a) return false;
  if (down) keys[e.key] = e.shiftKey ? a[2] : a[1]; else delete keys[e.key];
  return true;
}

export function setLatch(on) { HAND.latch = !!on; if (onLatch) onLatch(HAND.latch); }
export function centreHands() { NAMES.forEach(n => { HAND.t[n] = 0; }); rebase(); }

// Every frame: held keys push, free hands spring back, the picture follows with a little weight.
export function handTick(dt) {
  // while a take is rendered the targets are the ones that were played; nothing held now may move them
  const driven = HAND.replay ? { spin: true, zoom: true, warp: true, trails: true }
    : { spin: pts.size > 0, zoom: pts.size > 0, warp: pts.size > 1, trails: pts.size > 1 };
  if (!HAND.replay) for (const key in keys) {
    const n = keys[key];
    HAND.t[n] = clamp1(HAND.t[n] + ARROWS[key][0] * KEY_RATE * dt);
    driven[n] = true;
  }
  const back = 1 - Math.exp(-dt / .22), follow = 1 - Math.exp(-dt / .07);
  let mag = 0;
  NAMES.forEach(n => {
    if (!driven[n] && !HAND.latch) HAND.t[n] -= HAND.t[n] * back;
    HAND.v[n] += (HAND.t[n] - HAND.v[n]) * follow;
    if (Math.abs(HAND.v[n]) < 1e-4 && Math.abs(HAND.t[n]) < 1e-4) HAND.v[n] = HAND.t[n] = 0;
    mag = Math.max(mag, Math.abs(HAND.v[n]));
  });
  HAND.active = mag > .012;
  if (!pad) return;
  if (HAND.active !== padOn) { padOn = HAND.active; pad.classList.toggle('on', padOn); }
  if (!padOn) return;
  pad.style.setProperty('--x', (HAND.v.spin * 40).toFixed(2) + '%');
  pad.style.setProperty('--y', (HAND.v.zoom * 40).toFixed(2) + '%');
  pad.style.setProperty('--x2', (HAND.v.trails * 40).toFixed(2) + '%');
  pad.style.setProperty('--y2', (HAND.v.warp * 40).toFixed(2) + '%');
}
