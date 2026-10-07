// The song as a waveform: where the sound is, and the clip, the stretch that plays in a loop and gets
// recorded. Tap to start the clip there, drag the clip to move it; with the song read ahead it lands
// on a bar. With the whole track chosen as length, a tap moves the sound instead.
import { SONG, CLIP, SESSION } from './state.js';
import { snapBar } from './audio/score.js';

let cv = null, g = null, audio = null, onPlace = null, W = 0, Hh = 0, ink = {}, inkAge = 0;
let drag = null;      // { grab } while the clip is being moved: grab is where inside the clip the finger is

const duration = () => SONG.score ? SONG.score.duration : (audio && isFinite(audio.duration) ? audio.duration : 0);
const whole = d => !(CLIP.len > 0) || CLIP.len >= d - .05;

export function initSongBar(canvas, audioEl, place) {
  cv = canvas; g = cv.getContext('2d'); audio = audioEl; onPlace = place;
  const timeAt = e => { const r = cv.getBoundingClientRect(); return r.width < 10 ? -1 : Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration(); };
  const put = (t, done) => {
    const d = duration();
    if (whole(d)) { onPlace(0, t, done); return; }
    let s = Math.max(0, Math.min(d - CLIP.len, t));
    if (SONG.score) { s = snapBar(SONG.score, s); while (s + CLIP.len > d + 1e-6) s -= SONG.score.bar; s = Math.max(0, s); }
    onPlace(s, s, done);
  };
  cv.addEventListener('pointerdown', e => {
    const t = timeAt(e), d = duration();
    if (t < 0 || !d || SESSION.active) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not everywhere */ }
    const inside = !whole(d) && t >= CLIP.start && t <= CLIP.start + CLIP.len;
    drag = { grab: inside ? t - CLIP.start : 0 };
    if (!inside) put(t, false);
  });
  cv.addEventListener('pointermove', e => { if (!drag) return; const t = timeAt(e); if (t >= 0) put(t - drag.grab, false); });
  const up = e => { if (!drag) return; const t = timeAt(e); const grab = drag.grab; drag = null; if (t >= 0) put(t - grab, true); };
  ['pointerup', 'pointercancel'].forEach(k => cv.addEventListener(k, up));
}

// Once per frame.
export function drawSongBar() {
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (w < 10 || h < 4) return;
  if (w !== W || h !== Hh) { cv.width = W = w; cv.height = Hh = h; }
  if (--inkAge < 0) {            // the page's colours, read again now and then so a change of theme is followed
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    ink = { strong: v('--ink') || '#0E0F11', soft: v('--ink-3') || '#5A5E66', line: v('--line') || '#CFCFC9', time: v('--rust') || '#B5420F', hand: v('--blue') || '#1F3BE2' };
    inkAge = 90;
  }
  const d = duration(), mid = h / 2, step = 3 * dpr, bw = 2 * dpr, sc = SONG.score;
  g.clearRect(0, 0, w, h);
  if (!d) return;
  const x = t => t / d * w, now = audio.currentTime || 0, full = whole(d);
  const c0 = full ? 0 : CLIP.start, c1 = full ? d : CLIP.start + CLIP.len;
  if (sc) {
    const n = sc.peaks.length;
    for (let px = 0; px < w; px += step) {
      let m = 0;
      for (let b = Math.floor(px / w * n), e = Math.max(b + 1, Math.floor((px + step) / w * n)); b < e && b < n; b++) if (sc.peaks[b] > m) m = sc.peaks[b];
      const t = (px + bw / 2) / w * d, bh = Math.max(dpr, Math.pow(m, .8) * (h - 4 * dpr));
      g.fillStyle = (t >= c0 && t <= c1) ? (t <= now ? ink.time : ink.strong) : ink.line;
      g.fillRect(px, mid - bh / 2, bw, bh);
    }
  } else {
    // not read yet (or it cannot be): a line, and how far the reading has come
    g.fillStyle = ink.line; g.fillRect(0, mid - dpr / 2, w, dpr);
    if (SONG.state === 'reading') { g.fillStyle = ink.soft; g.fillRect(0, mid - dpr, w * SONG.progress, 2 * dpr); }
    g.fillStyle = ink.time; g.fillRect(x(c0), mid - dpr, Math.max(0, x(Math.min(now, c1)) - x(c0)), 2 * dpr);
  }
  if (!full) {                   // the clip: a frame in the colour of what the hand sets
    g.strokeStyle = ink.hand; g.lineWidth = 1.5 * dpr;
    g.strokeRect(x(c0) + g.lineWidth / 2, g.lineWidth / 2, Math.max(4, x(c1) - x(c0) - g.lineWidth), h - g.lineWidth);
  }
  g.fillStyle = ink.time; g.fillRect(Math.round(x(now)) - dpr / 2, 0, 1.5 * dpr, h);
}
