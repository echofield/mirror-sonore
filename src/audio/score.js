// The song, read ahead of time.
//   decodeTrack   a file's bytes → samples
//   makeReader    samples → something that answers like the browser's AnalyserNode at any moment
//                 (same window, smoothing and decibel scale)
//   scanTrack     runs the detectors (detect.js) over the whole track, 60 steps a second, and keeps
//                 what they found: the envelopes step by step, every hit with its time, the tempo,
//                 where the bars fall, and the peaks for the waveform bar. That is the score.
//   followScore   reads the score at a time: the live page and a clip rendered frame by frame both
//                 use it, so the render hears exactly what the preview heard.
import { newA, newBeat } from '../state.js';
import { makeDetectors } from './detect.js';

const FFT = 2048, FPS = 60, PEAKS = 1200, TAU = .3, DB_MIN = -100, DB_MAX = -30;
export const KINDS = ['kick', 'snare', 'hat', 'drop'];

export function decodeTrack(arrayBuffer) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OC) return Promise.reject(new Error('no decoder'));
  const ctx = new OC(2, 2, 44100);
  return new Promise((ok, no) => { const p = ctx.decodeAudioData(arrayBuffer, ok, no); if (p && p.catch) p.catch(no); });
}

// Radix-2 FFT, in place, with the tables made once.
const COS = new Float32Array(FFT / 2), SIN = new Float32Array(FFT / 2), REV = new Uint16Array(FFT), WIN = new Float32Array(FFT);
for (let i = 0; i < FFT / 2; i++) { COS[i] = Math.cos(2 * Math.PI * i / FFT); SIN[i] = -Math.sin(2 * Math.PI * i / FFT); }
for (let i = 0, bits = Math.log2(FFT); i < FFT; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); REV[i] = r; }
for (let i = 0; i < FFT; i++) WIN[i] = .42 - .5 * Math.cos(2 * Math.PI * i / FFT) + .08 * Math.cos(4 * Math.PI * i / FFT);   // Blackman
function fft(re, im) {
  for (let i = 0; i < FFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= FFT; len <<= 1) {
    const half = len >> 1, step = FFT / len;
    for (let i = 0; i < FFT; i += len) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = i + k, b = a + half, vr = re[b] * COS[w] - im[b] * SIN[w], vi = re[b] * SIN[w] + im[b] * COS[w];
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
      }
    }
  }
}

export function makeReader(buffer) {
  const sr = buffer.sampleRate, len = buffer.length, nch = Math.min(2, buffer.numberOfChannels);
  const L = buffer.getChannelData(0), R = nch > 1 ? buffer.getChannelData(1) : L;
  const re = new Float32Array(FFT), im = new Float32Array(FFT), smooth = new Float32Array(FFT / 2), x = new Float32Array(FFT);
  let end = 0;
  const load = () => {      // the FFT-size stretch of sound that ends at the current moment; silence outside the track
    for (let i = 0, s = end - FFT; i < FFT; i++, s++) x[i] = (s >= 0 && s < len) ? (L[s] + R[s]) * .5 : 0;
  };
  return {
    fftSize: FFT, frequencyBinCount: FFT / 2, sampleRate: sr,
    seek(t) { end = Math.round(t * sr); },
    getByteTimeDomainData(arr) { load(); for (let i = 0; i < FFT; i++) { const v = 128 * (1 + x[i]); arr[i] = v < 0 ? 0 : (v > 255 ? 255 : v); } },
    getByteFrequencyData(arr) {
      load();
      for (let i = 0; i < FFT; i++) { re[i] = x[i] * WIN[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < FFT / 2; k++) {
        smooth[k] = TAU * smooth[k] + (1 - TAU) * Math.hypot(re[k], im[k]) / FFT;
        const v = 255 / (DB_MAX - DB_MIN) * (20 * Math.log10(smooth[k] || 1e-12) - DB_MIN);
        arr[k] = v < 0 ? 0 : (v > 255 ? 255 : v);
      }
    }
  };
}

// Mean energy of the score between two times (cum holds the running sum, one entry a step).
const meanE = (cum, fps, n, a, b) => { const i = Math.min(n, Math.max(0, Math.round(a * fps))), j = Math.min(n, Math.max(i + 1, Math.round(b * fps))); return (cum[j] - cum[i]) / (j - i); };
// How well a set of times falls on one grid of period p: the length of their mean vector on the circle.
function onGrid(ts, p) { let sx = 0, sy = 0; for (let i = 0; i < ts.length; i++) { const g = 2 * Math.PI * ts[i] / p; sx += Math.cos(g); sy += Math.sin(g); } return Math.hypot(sx, sy) / ts.length; }
// The peaks of that fit between two periods; of those within 90% of the best, the longest one.
function gridPeak(ts, lo, hi, step) {
  const peaks = []; let top = 0, prev = 0, prev2 = 0;
  for (let p = lo; p <= hi + step; p += step) {
    const r = p <= hi ? onGrid(ts, p) : 0;
    if (prev > prev2 && prev >= r) { peaks.push({ p: p - step, r: prev }); if (prev > top) top = prev; }
    prev2 = prev; prev = r;
  }
  let best = null;
  for (const k of peaks) if (k.r >= .9 * top) best = k;
  return best;
}
// The beat of a track from all its kicks and snares at once. First on 20 s stretches (a tempo that drifts
// must not blur the answer), then sharpened against the whole track. Returns the beat, folded into the
// range the live tempo uses (80 to 171 BPM), and the grain: the finest grid the hits agree on, which is
// half or a quarter of the beat when something answers the kick on the off-beat. Null with too little to go on.
function fitBeat(hits, duration) {
  const ts = hits.filter(h => h.k === 'kick' || h.k === 'snare').map(h => h.t);
  if (ts.length < 8) return null;
  const fold = p => { while (p < .35) p *= 2; while (p > .75) p /= 2; return p; };
  const found = [];
  for (let a = 0; a < duration; a += 20) {
    const part = ts.filter(t => t >= a && t < a + 20);
    if (part.length < 8) continue;
    const k = gridPeak(part, .175, .75, .001);
    if (k && k.r > .5) found.push(fold(k.p));
  }
  if (!found.length) return null;
  const rough = median(found), span = Math.max(1, ts[ts.length - 1] - ts[0]);
  let grain = rough, top = 0;
  for (const base of [rough, rough / 2, rough / 4]) {
    for (let q = base * .985, step = base * base / (8 * span); q <= base * 1.015; q += step) { const r = onGrid(ts, q); if (r > top) { top = r; grain = q; } }
  }
  if (top < .3) grain = rough;       // the tempo wanders: keep the rough value
  return { beat: fold(grain), grain };
}
const median = a => { const s = Array.from(a).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
const pause = () => new Promise(r => setTimeout(r, 0));

export async function scanTrack(buffer, onProgress) {
  const n = Math.max(1, Math.ceil(buffer.duration * FPS)), dt = 1 / FPS;
  const a = newA(), beat = newBeat(), hits = [];
  let now = 0;
  const on = {}; KINDS.forEach(k => { on[k] = () => hits.push({ t: now, k }); });
  const D = makeDetectors(a, beat, on), R = makeReader(buffer);
  D.configure(R.sampleRate, R.fftSize);
  const env = new Float32Array((n + 1) * 5), period = new Float32Array(n + 1), cum = new Float64Array(n + 2), tempos = [];
  for (let i = 0; i < n; i++) {
    now = i * dt; R.seek(now);
    D.analyse(dt, now, R, true);
    env[i * 5] = a.low; env[i * 5 + 1] = a.mid; env[i * 5 + 2] = a.high; env[i * 5 + 3] = a.lvl; env[i * 5 + 4] = a.wave;
    period[i] = beat.period; if (beat.bpm) tempos.push(beat.period);
    cum[i + 1] = cum[i] + .5 * a.lvl + .5 * a.low;
    if (i % 300 === 299) { if (onProgress) onProgress(i / n); await pause(); }
  }
  env.copyWithin(n * 5, (n - 1) * 5, n * 5); period[n] = period[n - 1]; cum[n + 1] = cum[n];

  // peaks for the waveform bar
  const L = buffer.getChannelData(0), Rr = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L, peaks = new Float32Array(PEAKS);
  const per = buffer.length / PEAKS;
  for (let b = 0; b < PEAKS; b++) {
    let m = 0;
    for (let s = Math.floor(b * per), e = Math.min(buffer.length, Math.floor((b + 1) * per)), st = Math.max(1, Math.floor(per / 400)); s < e; s += st) { const v = Math.abs(L[s] + Rr[s]) * .5; if (v > m) m = v; }
    peaks[b] = m;
  }
  let top = 0; for (let b = 0; b < PEAKS; b++) if (peaks[b] > top) top = peaks[b];
  if (top > 0) for (let b = 0; b < PEAKS; b++) peaks[b] /= top;

  // where the beats and the bars fall: the tempo the detectors settled on most of the time, the place
  // of the kicks inside a beat, and as the "one" the beat the drops land on
  const fitted = fitBeat(hits, buffer.duration);
  const beatLen = fitted ? fitted.beat : (tempos.length ? median(tempos) : .5), grain = fitted ? fitted.grain : beatLen, bar = 4 * beatLen;
  // where the grid sits: the mean place of the hits inside one grain
  let sx = 0, sy = 0, first = -1;
  hits.forEach(h => { if (h.k === 'kick' || h.k === 'snare') { if (first < 0 && h.k === 'kick') first = h.t; const g = 2 * Math.PI * (h.t % grain) / grain; sx += Math.cos(g); sy += Math.sin(g); } });
  let phase = (sx || sy) ? Math.atan2(sy, sx) / (2 * Math.PI) * grain : 0; if (phase < 0) phase += grain;
  // The drop detector also fires inside a steady groove. A rise is a drop where the next two seconds
  // are clearly louder than the four before: those mark the sections, and the bars are counted from
  // them (from the first kick when the track has none).
  const drops = hits.filter(h => h.k === 'drop').map(h => h.t);
  const rises = drops.filter(d => meanE(cum, FPS, n, d, d + 2) > 1.5 * meanE(cum, FPS, n, d - 4, d));
  const marks = rises.length ? rises : (first >= 0 ? [first] : []);
  let off = phase, bestFit = -Infinity;
  for (let c = 0, slots = Math.max(1, Math.round(bar / grain)); c < slots; c++) {
    const o = phase + c * grain; let fit = 0;
    marks.forEach(d => { fit += Math.cos(2 * Math.PI * (d - o) / bar); });
    if (fit > bestFit + 1e-9) { bestFit = fit; off = o; }
  }
  return { fps: FPS, n, env, period, cum, hits, peaks, drops, rises, duration: buffer.duration, beat: beatLen, bar, off: off % bar, bpm: (fitted || tempos.length) ? Math.round(60 / beatLen) : 0 };
}

// The nearest bar line.
export function snapBar(sc, t) {
  const s = sc.off + Math.round((t - sc.off) / sc.bar) * sc.bar;
  return s < 0 ? s + sc.bar : s;
}

// Where a clip of this length sounds best: the loudest stretch that starts on a bar, with a drop
// arriving after some build-up when there is one.
export function bestStart(sc, len) {
  if (!(len > 0) || len >= sc.duration - .05) return 0;
  const mean = (a, b) => meanE(sc.cum, sc.fps, sc.n, a, b);
  let best = 0, top = -Infinity;
  for (let s = sc.off - sc.bar * Math.floor(sc.off / sc.bar); s + len <= sc.duration + 1e-6; s += sc.bar) {
    let v = mean(s, s + len);
    for (const d of sc.rises) { const u = (d - s) / len; if (u > .12 && u < .6) v += .5; else if (u >= 0 && u <= .12) v -= .15; }
    if (v > top + 1e-9) { top = v; best = s; }
  }
  return Math.max(0, best);
}

// Read the score at time t: the envelopes between two steps, and every hit since the last reading.
// mem remembers where the last reading was ({ t, k }); a jump (a seek, a loop) fires nothing it skipped.
export function followScore(sc, t, dt, A, BEAT, on, mem) {
  const f = Math.max(0, Math.min(sc.n - 1e-3, t * sc.fps)), i = Math.floor(f), u = f - i, e = sc.env, o = i * 5;
  A.low = e[o] + (e[o + 5] - e[o]) * u; A.mid = e[o + 1] + (e[o + 6] - e[o + 1]) * u; A.high = e[o + 2] + (e[o + 7] - e[o + 2]) * u;
  A.lvl = e[o + 3] + (e[o + 8] - e[o + 3]) * u; A.wave = e[o + 4] + (e[o + 9] - e[o + 4]) * u;
  // the whole track's tempo is known from the first beat on; a track without one keeps the running guess
  BEAT.period = sc.bpm ? sc.beat : (sc.period[i] || BEAT.period); BEAT.bpm = sc.bpm || BEAT.bpm;
  const hits = sc.hits;
  if (t >= mem.t && t - mem.t < .25) {
    while (mem.k < hits.length && hits[mem.k].t <= t) {
      const h = hits[mem.k++];
      A[h.k] = 1;
      if (h.k === 'kick') BEAT.last = t;
      if (on[h.k]) on[h.k]();
    }
  } else {
    let lo = 0, hi = hits.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (hits[m].t <= t) lo = m + 1; else hi = m; }
    mem.k = lo;
  }
  mem.t = t;
  A.playT += dt;
  A.kick *= Math.exp(-dt * 8); A.snare *= Math.exp(-dt * 10); A.hat *= Math.exp(-dt * 16);
  A.drop *= Math.exp(-dt * 2.5); A.cut *= Math.exp(-dt * 5);
}
