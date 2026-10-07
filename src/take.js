// A take: what the controls and the hands did during one pass of the clip, written down with its
// time, so the pass can be drawn again frame by frame at full size (see exact.js and record.js).
// Like the phrase recorder of the hands engine it takes the idea from, nothing here reads a clock:
// the caller passes the time.
// What is written is the outcome, not the cause: when Auto picks a look during the pass, the look it
// picked and how it landed are in the take, so the render shows the same looks the player saw.
import { P, V, S, A, G, PUMP, AUTO, HAND, WV } from './state.js';
import { applyPalette } from './auto.js';
import { RNG, reseed, newSeed } from './rng.js';

const G_KEYS = ['dir', 'trip', 'echoRate', 'journey', 'blend', 'layer'];
const HANDS = ['spin', 'zoom', 'warp', 'trails'];
const pickG = () => { const o = {}; G_KEYS.forEach(k => { o[k] = G[k]; }); return o; };

// Everything a pass starts from, and the way back to it.
export function snapshot() {
  return {
    p: { ...P }, v: { ...V }, s: { ...S, poke: S.poke.slice() },
    a: { kick: A.kick, snare: A.snare, hat: A.hat, drop: A.drop, cut: A.cut, playT: A.playT },
    g: { clock: G.clock, easeTau: G.easeTau, arc: G.arc, ...pickG() },
    pump: { ...PUMP }, auto: { ...AUTO },
    hand: { t: { ...HAND.t }, v: { ...HAND.v }, latch: HAND.latch },
    wave: WV.hist.slice(), seed: RNG.seed
  };
}
export function restore(st) {
  Object.assign(P, st.p); Object.assign(V, st.v); Object.assign(S, st.s, { poke: st.s.poke.slice() });
  Object.assign(A, st.a); Object.assign(G, st.g); Object.assign(PUMP, st.pump); Object.assign(AUTO, st.auto);
  Object.assign(HAND.t, st.hand.t); Object.assign(HAND.v, st.hand.v); HAND.latch = st.hand.latch;
  WV.hist.set(st.wave);
  applyPalette();
}

export const TAKE = { rec: false, start: null, events: [], len: 0 };
let last = null;      // the controls as they were last written down
const controls = () => ({ p: { ...P }, g: pickG(), pump: PUMP.style + ' ' + PUMP.len, hand: HANDS.map(k => HAND.t[k]), latch: HAND.latch, look: G.lookSeq });

export function beginTake() {
  reseed(newSeed());
  TAKE.start = snapshot(); TAKE.events = []; TAKE.len = 0; TAKE.rec = true;
  last = controls();
}
// Once per frame while the take is played: write down what changed, at clip time t (seconds).
export function takeTick(t) {
  if (!TAKE.rec) return;
  const now = controls(), ev = { t };
  let any = false;
  for (const k in now.p) if (now.p[k] !== last.p[k]) { (ev.p || (ev.p = {}))[k] = now.p[k]; any = true; }
  for (const k of G_KEYS) if (now.g[k] !== last.g[k]) { (ev.g || (ev.g = {}))[k] = now.g[k]; any = true; }
  if (now.pump !== last.pump) { ev.pump = { ...PUMP }; any = true; }
  if (now.latch !== last.latch) { ev.latch = now.latch; any = true; }
  if (now.hand.some((v, i) => v !== last.hand[i])) { ev.hand = now.hand; any = true; }
  if (now.look !== last.look && G.lookImp) { ev.imp = { ...G.lookImp }; any = true; }   // a look was applied: how it landed
  if (ev.p) ev.tau = G.easeTau;
  if (any) TAKE.events.push(ev);
  last = now;
}
export function endTake(len) { TAKE.rec = false; TAKE.len = len; }

// Play the written events up to clip time t. cur ({ i }) is kept by the caller between frames.
// looks false keeps only the hands, for a variation that gets looks of its own.
export function playTake(t, cur, looks) {
  const evs = TAKE.events;
  while (cur.i < evs.length && evs[cur.i].t <= t) {
    const ev = evs[cur.i++];
    if (looks) {
      if (ev.p) Object.assign(P, ev.p);
      if (ev.tau) G.easeTau = ev.tau;
      if (ev.g) { Object.assign(G, ev.g); applyPalette(); }
      if (ev.pump) Object.assign(PUMP, ev.pump);
      if (ev.imp) {
        S.morph = Math.max(S.morph, ev.imp.morph); A.cut = Math.max(A.cut, ev.imp.cut);
        G.easeTau = ev.imp.tau; S.seed = ev.imp.seed; S.drift += ev.imp.drift;
      }
    }
    if (ev.hand) HANDS.forEach((k, i) => { HAND.t[k] = ev.hand[i]; });
    if (ev.latch !== undefined) HAND.latch = ev.latch;
  }
}
