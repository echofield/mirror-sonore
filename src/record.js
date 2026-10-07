// Recording. There are two ways to make a clip.
//   Exact: the clip is drawn frame by frame at the full output size and written with its own stretch
//   of the song (exact.js), so the file is the same on a slow phone and on a fast computer. It needs the
//   song read ahead and a browser that can encode. With Capture on Perform the clip is first played once
//   while the hands and the controls are written down as a take (take.js), then drawn from the take; on
//   Instant it is drawn straight away.
//   Live: the canvas and the sound are captured as they play (MediaRecorder). The fallback: a video as
//   the picture, a song that could not be read, an older browser.
// A session makes 1, 3 or 5 clips; those after the first are the same stretch (and the same hands) with
// a new look. A still image is the canvas itself, saved as a PNG at the full output size.
import { LENS, MODES } from './config.js';
import { G, P, S, AUTO, OUT, SESSION, CLIP, SONG, HAND } from './state.js';
import { audio, ensureCtx, recordStream } from './audio/engine.js';
import { lookFor, applyLook } from './auto.js';
import { el, toast, lockExport, setRecUI, addResultCard, setAutoUI } from './ui.js';
import { setOutputScale } from './view.js';
import { TAKE, beginTake, takeTick, endTake, playTake, snapshot, restore } from './take.js';
import { exactSupport, clipSound, writeClip } from './exact.js';
import { RNG, reseed, newSeed } from './rng.js';

const stamp = () => { const d = new Date(), z = n => (n < 10 ? '0' : '') + n; return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
const fmt = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
const FPS = 30;

export const MIME = pickMime();
export const EXT = MIME.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const c = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
             'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

let canvas = null, frameAt = null;       // frameAt(t, dt, ms, auto): one frame of the engine at a chosen moment (main.js)
let recorder = null, chunks = [], recT0 = 0, recLen = 0, clipActive = false, wakeLock = null, clipLabel = '', resultCount = 0, clipCount = 0, stillWait = 0;
let codecs = null, writer = writeClip;   // what the exact way can encode at the current size; the writer (replaced in tests)
let X = null;                            // an exact session: { t0, len, phase: 'take' | 'render', back, resume }
let lastEnd = null, testLen = 0;         // for the tests: where the last render ended; a clip length to use instead

const canLive = () => !!(MIME && canvas && canvas.captureStream);
export const canRecord = () => !!codecs || canLive();
export function initRecord(cv, engineFrame) { canvas = cv; frameAt = engineFrame; }
// Ask what can be encoded at the current output size.
export function refreshExact() { return exactSupport(G.W, G.H).then(c => { codecs = c; return c; }); }
export const exactReady = () => !!(codecs && SONG.score && SONG.buffer && !G.videoOn);

function wake() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }, () => {}); } catch (e) { /* optional */ } }
function unwake() { if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; } }

export function toggleRecord(soundReady) {
  if (SESSION.active) { stopPressed(); return; }
  if (!soundReady) return;
  ensureCtx();
  if (exactReady()) { startExact(); return; }
  if (!canLive()) return;
  const rs = recordStream();
  if (!rs) { toast('This browser cannot capture the sound for the video.'); return; }
  if (LENS[OUT.len] === 0) {
    if (!isFinite(audio.duration)) { toast('The track length is unknown, so pick 15s, 30s or 60s.'); return; }
    audio.currentTime = 0;
  } else audio.currentTime = CLIP.start;      // the clip shown on the song bar is what gets recorded
  setOutputScale(1);   // always record at full output resolution
  Object.assign(SESSION, { active: true, total: OUT.clips, done: 0, cancel: false, start: audio.currentTime });
  SESSION.stream = new MediaStream(canvas.captureStream(FPS).getVideoTracks().concat(rs.getAudioTracks()));
  lockExport(true);
  wake();
  startClip();
}
function stopPressed() {
  if (!X) { SESSION.cancel = true; stopClip(); return; }
  if (X.phase === 'render') { SESSION.cancel = true; return; }      // the render sees it and stops
  const e = audio.currentTime - X.t0;
  if (e >= 1) finishTake(e);                                         // a short take is still a take
  else { SESSION.cancel = true; endTake(0); audio.pause(); endExact(); }
}

// ---------- exact: a take, then frame by frame ----------
function startExact() {
  const whole = LENS[OUT.len] === 0, t0 = whole ? 0 : CLIP.start, dur = SONG.score.duration;
  const len = Math.max(.5, Math.min(testLen || (whole ? dur : LENS[OUT.len]), dur - t0));
  Object.assign(SESSION, { active: true, total: OUT.clips, done: 0, cancel: false, start: t0 });
  X = { t0, len, phase: 'take', back: null, resume: !audio.paused };
  lockExport(true);
  wake();
  if (OUT.capture === 'Instant') {
    audio.pause();
    reseed(newSeed());
    Object.assign(TAKE, { rec: false, start: snapshot(), events: [], len });
    X.back = TAKE.start;
    renderNext();
    return;
  }
  audio.loop = false; audio.currentTime = t0;
  beginTake();
  setRecUI(true, 1, SESSION.total, 'Finish the take');
  audio.play().then(() => { if (X && X.phase === 'take') clipActive = true; })
    .catch(() => { toast('Playback was blocked. Tap Record again.'); endTake(0); endExact(); });
}
function finishTake(len) {
  clipActive = false;
  endTake(Math.max(.5, Math.min(X.len, len)));
  audio.pause();
  X.back = snapshot();          // where the player was when the take ended: the page returns there after the render
  renderNext();
}
async function renderNext() {
  X.phase = 'render';
  const n = SESSION.done, frames = Math.max(1, Math.round(TAKE.len * FPS)), variation = n > 0;
  const looks = !variation && OUT.capture !== 'Instant';   // the first clip of a performed take shows the looks the player saw
  setRecUI(true, n + 1, SESSION.total, 'Cancel');
  G.exact = true; HAND.replay = true;
  setOutputScale(1);
  // a short run-in before the clip, so the trails are already there; then back to the take's own beginning
  restore(TAKE.start);
  for (let i = 18; i > 0; i--) frameAt(Math.max(0, X.t0 - i / FPS), 1 / FPS, 0, false);
  restore(TAKE.start); reseed(TAKE.start.seed + ':' + n);
  if (looks) AUTO.on = false;                              // those looks are in the take: Auto must not pick again
  if (variation) {
    applyLook(lookFor(G.dir, { change: true, big: true, full: true }), 'user');
    S.seed = RNG.looks.next() * 100; S.drift += 3 + RNG.looks.next() * 9;
  }
  const cur = { i: 0 }, auto = AUTO.on;
  clipLabel = G.dir + (TAKE.start.auto.on ? ' · Auto' : ' · ' + MODES[P.mode]);
  let blob = null, failed = false;
  try {
    blob = await writer({
      canvas, codecs, fps: FPS, frames, bitrate: G.W >= 1080 ? 14e6 : 8e6,
      sound: () => clipSound(SONG.buffer, X.t0, TAKE.len),
      drawFrame: i => { const tau = i / FPS; playTake(tau, cur, looks); G.recT = tau; G.recLen = TAKE.len; frameAt(X.t0 + tau, 1 / FPS, tau * 1000, auto); },
      onProgress: p => {
        el.recTime.textContent = 'RENDER ' + Math.round(p * 100) + '%' + (SESSION.total > 1 ? ' · ' + (n + 1) + '/' + SESSION.total : '');
        el.recFill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      },
      stopped: () => SESSION.cancel
    });
  } catch (e) { failed = true; console.error(e); }
  lastEnd = snapshot();
  if (blob) addResult(blob, 'mp4', TAKE.len, 'frame by frame');
  SESSION.done++;
  if (blob && !SESSION.cancel && SESSION.done < SESSION.total) { renderNext(); return; }
  endExact();
  if (failed) { codecs = null; toast('This device could not render the clip frame by frame. Tap Record again: it will be recorded live.'); }
}
function endExact() {
  const was = X;
  X = null; clipActive = false; G.exact = false; HAND.replay = false; G.recT = -1;
  if (was && was.back) restore(was.back);
  SESSION.active = false; audio.loop = true;
  setRecUI(false); lockExport(false); setAutoUI(); unwake();
  if (was && was.resume && !SESSION.cancel) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); }
}

// ---------- live: the canvas and the sound as they play ----------
function startClip() {
  if (!SESSION.active) return;
  const len = LENS[OUT.len];
  if (SESSION.done > 0) {
    applyLook(lookFor(G.dir, { change: true, big: true, full: true }), 'user');
    S.seed = RNG.looks.next() * 100; S.drift += 3 + RNG.looks.next() * 9;
    audio.currentTime = SESSION.start;
  }
  recLen = len === 0 ? audio.duration - SESSION.start : len;
  audio.loop = len !== 0;
  const opts = { mimeType: MIME, videoBitsPerSecond: G.W >= 1080 ? 14e6 : 8e6, audioBitsPerSecond: 192000 };
  try { recorder = new MediaRecorder(SESSION.stream, opts); }
  catch (e) {
    try { recorder = new MediaRecorder(SESSION.stream); }
    catch (e2) { toast('Recording could not start in this browser.'); endSession(); return; }
  }
  chunks = [];
  recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onClipStop;
  clipActive = true; recT0 = 0;
  clipLabel = G.dir + (AUTO.on ? ' · Auto' : ' · ' + MODES[P.mode]);
  setRecUI(true, SESSION.done + 1, SESSION.total);
  audio.play().then(() => {
    if (!clipActive) { audio.pause(); return; }
    recT0 = performance.now();
    try { recorder.start(1000); } catch (e) { clipActive = false; toast('Recording could not start in this browser.'); endSession(); }
  }).catch(() => { clipActive = false; endSession(); toast('Playback was blocked. Tap Record again.'); });
}

// The sound reached its end, or the clip its length.
export function stopClip() {
  if (X) { if (X.phase === 'take' && clipActive) finishTake(audio.currentTime - X.t0); return; }
  if (!clipActive) { if (SESSION.active && SESSION.cancel) endSession(); return; }
  clipActive = false;
  audio.pause();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else onClipStop();
}

function onClipStop() {
  if (chunks.length) {
    const type = (recorder && recorder.mimeType) || MIME || 'video/webm';
    addResult(new Blob(chunks, { type: type.split(';')[0] }), type.indexOf('mp4') >= 0 ? 'mp4' : 'webm', Math.min(recLen, recT0 ? (performance.now() - recT0) / 1000 : 0), '');
  }
  chunks = [];
  SESSION.done++;
  if (SESSION.active && !SESSION.cancel && SESSION.done < SESSION.total) setTimeout(startClip, 300);
  else endSession();
}

function endSession() {
  if (!SESSION.active) return;
  SESSION.active = false;
  audio.loop = true;
  if (SESSION.stream) SESSION.stream.getVideoTracks().forEach(t => t.stop());
  SESSION.stream = null;
  setRecUI(false);
  lockExport(false);
  unwake();
}

// The page went to the background. A take or a live recording cannot go on unseen; a render can wait.
export function pageHidden() {
  if (!SESSION.active) return;
  if (X) {
    if (X.phase === 'take') { SESSION.cancel = true; endTake(0); audio.pause(); endExact(); toast('The take stopped because the page went to the background.'); }
    return;
  }
  SESSION.cancel = true; stopClip();
  toast('Recording stopped because the page went to the background. Finished clips are kept.');
}

// Still image. A slow phone previews at a lower scale, so go to full size first and give the
// trails a moment to build back; otherwise the frame just drawn is the one that is saved.
export function takeStill() {
  if (!canvas || stillWait || G.exact) return;
  if (G.scale < 1) { setOutputScale(1); stillWait = 20; } else stillWait = 1;
}
function grabStill() {
  const w = canvas.width, h = canvas.height, label = G.dir + ' · ' + MODES[P.mode];
  el.monitor.classList.remove('flash'); void el.monitor.offsetWidth; el.monitor.classList.add('flash');
  canvas.toBlob(blob => {
    if (!blob) { toast('The image could not be made on this device.'); return; }
    resultCount++;
    const name = `miroir-sonore-${stamp()}-${resultCount}.png`;
    addResultCard(blob, name, `${w} × ${h} · PNG · ${(blob.size / 1048576).toFixed(1)} MB · ${label}`, false, 'image');
    toast('Image ready. It is also under Export.', { label: 'Save', fn: () => saveBlob(blob, name).then(toast) });
  }, 'image/png');
}

// Called every frame: the still that is due, the take being written, the progress display, the stop at the chosen length.
export function recordTick(now) {
  if (stillWait && --stillWait === 0) grabStill();
  if (X) {
    if (X.phase !== 'take' || !clipActive) return;
    const e = Math.max(0, audio.currentTime - X.t0);
    takeTick(e);
    G.recT = e; G.recLen = X.len;      // the Journey arc follows the clip
    el.recTime.textContent = 'TAKE ' + fmt(e) + ' / ' + fmt(X.len) + (SESSION.total > 1 ? ' · 1/' + SESSION.total : '');
    el.recFill.style.transform = 'scaleX(' + Math.min(1, e / X.len).toFixed(4) + ')';
    if (e >= X.len) finishTake(e);
    return;
  }
  if (!clipActive || !recT0) { G.recT = -1; return; }
  const e = (now - recT0) / 1000;
  G.recT = e; G.recLen = recLen;
  el.recTime.textContent = 'REC ' + fmt(e) + ' / ' + fmt(recLen) + (SESSION.total > 1 ? ' · ' + (SESSION.done + 1) + '/' + SESSION.total : '');
  el.recFill.style.transform = 'scaleX(' + Math.min(1, e / recLen).toFixed(4) + ')';
  if (e >= recLen) stopClip();
}
export const isClipActive = () => clipActive;

function addResult(blob, ext, secs, how) {
  resultCount++;
  const name = `miroir-sonore-${stamp()}-${resultCount}.${ext}`;
  const info = `${G.W} × ${G.H} · ${fmt(secs)} · ${(blob.size / 1048576).toFixed(1)} MB · ${clipLabel}` + (how ? ' · ' + how : '');
  addResultCard(blob, name, info, ++clipCount === 1, 'video');
}

// For the tests: pretend the browser can encode (with a writer that only draws), shorten the clip, look at a render.
export const TESTING = {
  exact(c, w) { codecs = c; writer = w || writeClip; },
  len(v) { testLen = v; },
  lastEnd: () => lastEnd,
  phase: () => (X ? X.phase : '')
};

// Saving: inside claude.ai the page must use the downloads capability (plain downloads are blocked there).
// Deployed on its own, it uses the share sheet when it can take files (iOS → Save Video), else a download link.
const downloadsP = (window.claude && typeof window.claude.use === 'function')
  ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
export async function saveBlob(blob, name) {
  const dl = await downloadsP;
  if (dl) {
    try { await dl.save({ filename: name, data: blob }); return 'Saved. Post it from your camera roll or downloads.'; }
    catch (err) {
      const c = err && err.code;
      return c === 'declined' ? 'Save cancelled.' :
        c === 'rate_limited' ? 'A save prompt is already open.' :
        c === 'too_large' ? 'This file is too large to save here. Try 720p or a shorter length.' :
        c === 'rejected_extension' ? 'This format cannot be saved here.' :
        'Saving is not available in this view.';
    }
  }
  if (window.claude) return 'Saving is not available in this view. Open the page in the Claude app or on claude.ai.';
  try {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return 'Shared.'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'Share cancelled.'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  return 'Downloaded.';
}
