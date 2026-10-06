// Recording: canvas.captureStream(30) + the audio graph's MediaStreamDestination → MediaRecorder.
// A session records 1, 3 or 5 clips; clips after the first replay the same section with a new look.
import { LENS, MODES } from './config.js';
import { G, P, S, AUTO, OUT, SESSION } from './state.js';
import { audio, ensureCtx, recordStream } from './audio/engine.js';
import { lookFor, applyLook } from './auto.js';
import { el, toast, lockExport, setRecUI, addResultCard } from './ui.js';
import { setOutputScale } from './view.js';

export const MIME = pickMime();
export const EXT = MIME.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const c = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
             'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

let canvas = null, recorder = null, chunks = [], recT0 = 0, recLen = 0, clipActive = false, wakeLock = null, clipLabel = '', resultCount = 0;
export const canRecord = () => !!(MIME && canvas && canvas.captureStream);
export function initRecord(cv) { canvas = cv; }

export function toggleRecord(soundReady) {
  if (SESSION.active) { SESSION.cancel = true; stopClip(); return; }
  if (!canRecord() || !soundReady) return;
  ensureCtx();
  const rs = recordStream();
  if (!rs) { toast('This browser cannot capture the sound for the video.'); return; }
  if (LENS[OUT.len] === 0) {
    if (!isFinite(audio.duration)) { toast('The track length is unknown, so pick 15s, 30s or 60s.'); return; }
    if (audio.currentTime > audio.duration - 1) audio.currentTime = 0;
  }
  setOutputScale(1);   // always record at full output resolution
  Object.assign(SESSION, { active: true, total: OUT.clips, done: 0, cancel: false, start: audio.currentTime });
  SESSION.stream = new MediaStream(canvas.captureStream(30).getVideoTracks().concat(rs.getAudioTracks()));
  lockExport(true);
  try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }, () => {}); } catch (e) { /* optional */ }
  startClip();
}

function startClip() {
  if (!SESSION.active) return;
  const len = LENS[OUT.len];
  if (SESSION.done > 0) {
    applyLook(lookFor(G.dir, { change: true, big: true, full: true }), 'user');
    S.seed = Math.random() * 100; S.drift += 3 + Math.random() * 9;
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

export function stopClip() {
  if (!clipActive) { if (SESSION.active && SESSION.cancel) endSession(); return; }
  clipActive = false;
  audio.pause();
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else onClipStop();
}

function onClipStop() {
  if (chunks.length) makeResult(chunks, Math.min(recLen, recT0 ? (performance.now() - recT0) / 1000 : 0));
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
  if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
}

// Called every frame: progress display and the stop at the chosen length.
export function recordTick(now) {
  if (!clipActive || !recT0) { G.recT = -1; return; }
  const e = (now - recT0) / 1000;
  G.recT = e; G.recLen = recLen;   // the Journey arc follows the clip
  el.recTime.textContent = 'REC ' + fmt(e) + ' / ' + fmt(recLen) + (SESSION.total > 1 ? ' · ' + (SESSION.done + 1) + '/' + SESSION.total : '');
  el.recFill.style.transform = 'scaleX(' + Math.min(1, e / recLen).toFixed(4) + ')';
  if (e >= recLen) stopClip();
}
export const isClipActive = () => clipActive;
const fmt = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };

function makeResult(parts, secs) {
  const type = (recorder && recorder.mimeType) || MIME || 'video/webm';
  const ext = type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const blob = new Blob(parts, { type: type.split(';')[0] });
  const d = new Date(), z = n => (n < 10 ? '0' : '') + n;
  resultCount++;
  const name = `miroir-sonore-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}-${resultCount}.${ext}`;
  const info = `${G.W} × ${G.H} · ${fmt(secs)} · ${(blob.size / 1048576).toFixed(1)} MB · ${clipLabel}`;
  addResultCard(blob, name, info, resultCount === 1);
}

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
        c === 'too_large' ? 'This clip is too large to save here. Try 720p or a shorter length.' :
        c === 'rejected_extension' ? 'This video format cannot be saved here.' :
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
