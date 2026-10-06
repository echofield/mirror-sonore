// Boot and the frame loop. Order per frame: clock → analysis → Auto → mapping → render → HUD → recording.
import { G, SESSION, U, V, S, PUMP, BEAT } from './state.js';
import { initRenderer, uploadImage, render } from './gl/renderer.js';
import { audio, ensureCtx, analyse, on, resetAnalysis } from './audio/engine.js';
import { makeSampleLoop } from './audio/sample-loop.js';
import { makeSampleImage } from './image/sample-image.js';
import { extractPalette } from './image/palette.js';
import { step, reactKick, reactSnare } from './map.js';
import { setDirection, setAuto, autoTick, autoOnKick, autoOnDrop, applyPalette } from './auto.js';
import { initUI, el, toast, setPlaying, setSoundReady, updateHUD, updatePictureSwatch, drawThumb, setFill, syncExport } from './ui.js';
import { initView, applySize, adaptQuality } from './view.js';
import { MIME, EXT, initRecord, canRecord, toggleRecord, recordTick, saveBlob, stopClip, isClipActive } from './record.js';
import { DEFAULT_DIR } from './config.js';

let soundURL = null, soundReady = false, scrubbing = false;

function boot() {
  const canvas = document.getElementById('view');
  const err = initRenderer(canvas, (src, w, h) => {
    drawThumb(src, w, h);
    G.picturePal = extractPalette(src) || G.picturePal;
    updatePictureSwatch();
    if (G.dir === 'Picture') applyPalette();
  });
  if (err) { document.getElementById('monitor').innerHTML = '<p class="err">' + err + '</p>'; return; }
  initView(canvas);
  initRecord(canvas);
  initUI({
    togglePlay, routeFile, loadImageFile, loadSoundFile, applySize, saveBlob,
    toggleRecord: () => toggleRecord(soundReady),
    soundReady: () => soundReady, canRecord, isPlaying: () => !audio.paused, ext: MIME ? EXT : ''
  });
  if (!window.MediaRecorder || !canvas.captureStream) {
    el.recNote.textContent = 'Recording needs a browser that can capture video, such as Chrome, Edge, Firefox or Safari 14.1 and later.';
  }

  on.kick = () => { reactKick(); autoOnKick(); };
  on.snare = reactSnare;
  on.drop = autoOnDrop;

  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { if (isClipActive()) stopClip(); });
  audio.addEventListener('error', () => { if (audio.src) toast('That sound could not be played. Try an MP3, WAV or M4A file.'); });
  audio.addEventListener('loadedmetadata', () => { el.tDur.textContent = fmtT(audio.duration); });
  el.scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  window.addEventListener('pointerup', () => { scrubbing = false; });
  el.scrub.addEventListener('change', () => { scrubbing = false; });
  el.scrub.addEventListener('input', () => {
    setFill(el.scrub);
    if (isFinite(audio.duration) && !SESSION.active) audio.currentTime = el.scrub.value / 1000 * audio.duration;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && SESSION.active) { SESSION.cancel = true; stopClip(); toast('Recording stopped because the page went to the background. Finished clips are kept.'); }
  });

  const sample = makeSampleImage();
  uploadImage(sample, sample.width, sample.height);
  setDirection(DEFAULT_DIR);
  setAuto(true);
  applySize();
  syncExport();
  requestAnimationFrame(frame);
  makeSampleLoop().then(blob => {
    if (!soundReady) setSound(URL.createObjectURL(blob), 'Sample loop · 120 BPM');
  }).catch(() => {
    el.sndName.textContent = 'Choose a sound to start';
    el.bigPlayLbl.textContent = 'Choose a sound to start';
  });
}
const fmtT = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };

function togglePlay() {
  if (!soundReady || SESSION.active) return;
  ensureCtx();
  if (audio.paused) audio.play().catch(() => toast('Playback was blocked. Tap Play again.'));
  else audio.pause();
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { uploadImage(img, img.naturalWidth, img.naturalHeight); el.imgName.textContent = file.name || 'Image'; URL.revokeObjectURL(url); };
  img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened. Try a JPG, PNG or WebP.'); };
  img.src = url;
}
function setSound(url, name) {
  const wasPlaying = !audio.paused;
  if (soundURL && soundURL !== url) URL.revokeObjectURL(soundURL);
  soundURL = url;
  audio.src = url; audio.load();
  soundReady = true;
  resetAnalysis();
  setSoundReady(name);
  if (wasPlaying) audio.play().catch(() => {});
}
function loadSoundFile(file) { setSound(URL.createObjectURL(file), file.name || 'Sound'); }
function routeFile(f) {
  const t = f.type || '', n = (f.name || '').toLowerCase();
  if (t.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|avif|bmp)$/.test(n)) loadImageFile(f);
  else if (t.indexOf('audio/') === 0 || t.indexOf('video/') === 0 || /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|aiff?|mp4|mov|webm)$/.test(n)) loadSoundFile(f);
  else toast('Drop an image (JPG, PNG, WebP) or a sound (MP3, WAV, M4A).');
}

let prevNow = performance.now();
function frame(now) {
  const dt = Math.min(.05, Math.max(.001, (now - prevNow) / 1000)); prevNow = now;
  const playing = !audio.paused;
  if (playing) G.clock += dt;
  analyse(dt);
  autoTick(playing);
  step(dt);
  render(now);
  updateHUD(audio, scrubbing);
  recordTick(now);
  adaptQuality(dt, now, SESSION.active);
  requestAnimationFrame(frame);
}

// Test hook: tests/sim.test.mjs sets window.__MS_TEST__ to read live values. Inert otherwise.
if (window.__MS_TEST__) window.__ms = { U, V, S, G, PUMP, BEAT };
boot();
