// Sound → picture. Runs once per frame after analysis and turns envelopes and hits into uniforms.
// Three user macros scale everything here:
//   V.beat — hits (glitch, color split, ripples, spin jolts, drop flash)
//   V.pump — the kick "sidechaining" the picture (zoom, brightness, contrast), shaped by PUMP.style/len
//   V.flow — continuous motion driven by the music
// Pump is the only place the kick or bass moves zoom and brightness, so Pump Off means no pumping.
import { A, S, V, P, U, G, BEAT, PUMP } from './state.js';
import { KEYS, HOLO, PUMP_LENGTHS, ECHO_RATES } from './config.js';

const clamp = (v, a = 0, b = 1) => v < a ? a : (v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export function reactKick() {
  const dir = Math.random() < .5 ? -1 : 1;
  S.rotV += dir * V.punch * V.beat * .9 * (Math.abs(V.spin) + .15);
  S.poke = [rnd(-.25, .25), rnd(-.35, .35), 0];
  S.pumpT = 0;
  S.echoT = 99;      // tracers re-capture on the kick, so they stutter on the beat grid
}

// Pump envelope and its effect on zoom / brightness / contrast (multipliers and offsets).
function pumpShape(dt, F) {
  S.pumpT += dt;
  const len = Math.max(.06, BEAT.period * PUMP_LENGTHS[PUMP.len]);
  const env = Math.pow(clamp(1 - S.pumpT / len), 1.6);      // 1 on the kick → 0 after `len`
  const bass = clamp(A.low * F);
  const amt = V.pump;
  switch (PUMP.style) {
    case 'Duck':    return { z: -.13 * env * amt, b: -.32 * env * amt, c: -.08 * env * amt };
    case 'Punch':   return { z: (.3 * env + .08 * bass) * amt, b: .22 * env * amt, c: .15 * env * amt };
    case 'Breathe': return { z: .16 * bass * amt, b: .08 * bass * amt, c: .25 * bass * amt };
    default:        return { z: 0, b: 0, c: 0 };
  }
}
// Journey: with a trip on, its intensity builds over the first quarter of a clip, peaks, and eases at the end.
// While previewing it swells and settles in a slow 32 s wave instead.
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function journeyArc() {
  if (!G.trip || !G.journey) return 1;
  if (G.recT >= 0 && G.recLen > 0) { const x = clamp(G.recT / G.recLen); return .5 + .5 * smooth(0, .25, x) * (1 - .3 * smooth(.8, 1, x)); }
  return .55 + .45 * (.5 - .5 * Math.cos(2 * Math.PI * G.clock / 32));
}

export function reactSnare() {
  S.sliceSeed = Math.random() * 100;
  if (G.dir === 'Original') S.hueKick += (Math.random() < .5 ? -1 : 1) * V.color * .25 * V.beat;
  else S.palTarget += .25 * clamp(V.color * 2) * Math.min(1, V.beat + .2);
}

export function step(dt) {
  const a = 1 - Math.exp(-dt / G.easeTau);
  for (const k of KEYS) V[k] += (P[k] - V[k]) * a;
  G.easeTau = Math.max(.1, G.easeTau - dt * .25);

  const Bt = V.beat, F = V.flow;
  const k = A.kick * V.punch * Bt, sn = A.snare * Bt, ht = A.hat * Math.min(1, Bt + .3), drop = A.drop * Bt, cut = A.cut * Bt;
  const lo = clamp(A.low * F), mi = clamp(A.mid * F), hi = clamp(A.high * F), lv = clamp(A.lvl * F);
  const sl = G.reduced ? .4 : 1, f60 = dt * 60;

  S.morph *= Math.exp(-dt * 1.6);
  S.t += dt * (.3 + 1.6 * lv + .8 * k) * sl;
  S.rot += dt * (V.spin * (.2 + 1.3 * lv) + S.rotV) * sl;
  S.rotV *= Math.exp(-dt * 3.5);
  S.drift += dt * (.05 + .25 * lv) * sl;
  S.tun += dt * (.1 + .9 * lv + 2.2 * k) * sl;
  S.jul += dt * (.04 + .22 * lv + .6 * k) * sl;
  S.palTarget += dt * V.color * (.02 + .18 * hi);
  S.palPhase += (S.palTarget - S.palPhase) * (1 - Math.exp(-dt / .12));
  // Original keeps the picture's hues: the drift swings around zero and hits decay back.
  S.hueT += dt * (.15 + .5 * hi);
  S.hueKick *= Math.exp(-dt * 1.5);
  U.hue = G.dir === 'Original' ? V.color * .45 * Math.sin(S.hueT) + S.hueKick : 0;
  S.poke[2] += dt;
  S.tiltPh += dt * (.12 + .5 * lv) * sl;

  const pm = pumpShape(dt, F);
  U.zoom = V.zoom * (1 + pm.z + .05 * sn * V.punch + .2 * drop);
  U.warp = V.warp * (.25 + 1.1 * mi) + .1 * k + (P.mode === HOLO ? .3 * lo * V.warp : 0);
  U.twist = V.warp * (.9 * Math.sin(S.t * .27) + 2 * mi) + .6 * k;
  U.chroma = .3 + 5 * k + 3 * sn * V.glitch + 2 * hi + 3 * cut;
  U.bright = Math.max(.3, .96 + pm.b + .55 * drop + .35 * cut);
  U.contrast = 1.04 + pm.c;
  U.sat = 1 + .3 * hi + ({ Ink: 0, Original: 0, Picture: .05 }[G.dir] ?? .12);
  // Trails; a Morph transition temporarily holds the old frame so looks dissolve into each other.
  const trailBase = clamp(V.trails * (1 - .55 * k - .5 * cut), 0, .97);
  U.trail = Math.max(Math.pow(trailBase, f60), Math.pow(.94, f60) * S.morph);
  U.fb = 1 + (.003 + .028 * k + .008 * lo) * f60 * (V.trails > .01 || S.morph > .05 ? 1 : 0);
  U.fbRot = V.spin * .003 * f60;
  U.dx = .32 * Math.sin(S.drift * 1.3 + S.seed); U.dy = .32 * Math.cos(S.drift * .9 + S.seed * 1.7);
  U.slice = V.glitch * (sn * .9 + drop * 1.2 + cut * .6);
  U.holo = clamp(V.holo + .15 * hi);
  U.sparkle = V.sparkle * (.35 + 1.4 * ht + .4 * hi);
  U.pokeAmp = V.punch * Bt * (.8 + .6 * lo);
  U.tx = .3 * Math.sin(S.tiltPh) + .12 * k; U.ty = .22 * Math.cos(S.tiltPh * .7) - .1 * k;
  const jr = .7885 + .012 * lo + .018 * k;          // Julia constant orbits the Mandelbrot edge
  U.jx = jr * Math.cos(S.jul); U.jy = jr * Math.sin(S.jul);
  U.grain = V.grain * (.75 + .7 * ht + .3 * hi);
  U.glow = V.glow * (.6 + .8 * drop) * (1 + Math.max(0, pm.b) * 3);   // glow pulses only with Punch/Breathe pumping

  // trip layer
  G.arc = journeyArc();
  if (G.trip) U.warp *= .7 + .3 * G.arc;
  U.lattice = V.lattice * (.5 + .5 * G.arc) * (1 + .3 * k);
  U.latScale = V.latScale * (1 + .05 * Math.sin(S.t * .35));
  U.echo = V.echo * (.55 + .45 * G.arc);
  U.breath = V.breath * (.55 + .45 * G.arc);
  S.echoT += dt;
  U.capture = V.echo > .01 && S.echoT >= Math.max(.05, BEAT.period * ECHO_RATES[G.echoRate]);
  if (U.capture) S.echoT = 0;
}
