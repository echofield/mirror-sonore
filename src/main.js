// Boot and the frame loop. Order per frame: clock → analysis → Auto → mapping → render → HUD → recording.
import { G, P, A, SESSION, U, V, S, PUMP, BEAT, WV, HAND } from './state.js';
import { handTick } from './hands.js';
import { initRenderer, uploadImage, uploadOver, useVideo, render } from './gl/renderer.js';
import { audio, ensureCtx, analyse, on, resetAnalysis } from './audio/engine.js';
import { makeSampleLoop } from './audio/sample-loop.js';
import { makeSampleImage } from './image/sample-image.js';
import { extractPalette } from './image/palette.js';
import { step, reactKick, reactSnare } from './map.js';
import { setDirection, setAuto, autoTick, autoOnKick, autoOnDrop, applyPalette } from './auto.js';
import { initUI, el, toast, setPlaying, setSoundReady, updateHUD, updatePictureSwatch, drawThumb, setFill, syncExport, syncUI } from './ui.js';
import { initView, applySize, adaptQuality } from './view.js';
import { MIME, EXT, initRecord, canRecord, toggleRecord, recordTick, saveBlob, stopClip, isClipActive, takeStill } from './record.js';
import { DEFAULT_DIR } from './config.js';

let soundURL = null, soundReady = false, scrubbing = false;

// A video can be the picture. It plays muted and follows the sound's clock, so the same section
// of the track always shows the same frames (which keeps the clips of one session comparable).
const video = document.createElement('video');
video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
let videoURL = null, videoOn = false;

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
    togglePlay, routeFile, loadPictureFile, loadSoundFile, loadOverFile, clearOver, applySize, saveBlob, takeStill,
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

const isVideo = f => (f.type || '').indexOf('video/') === 0 || /\.(mp4|mov|m4v|webm)$/i.test(f.name || '');
function loadPictureFile(file) { if (isVideo(file)) loadVideoFile(file); else loadImageFile(file); }
function dropVideo() {
  videoOn = false; video.pause();
  if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; video.removeAttribute('src'); video.load(); }
}
function loadVideoFile(file) {
  const url = URL.createObjectURL(file);
  dropVideo();
  videoURL = url;
  video.onloadeddata = () => {
    if (videoURL !== url || !video.videoWidth) return;
    videoOn = true;
    useVideo(video, video.videoWidth, video.videoHeight);
    el.imgName.textContent = file.name || 'Video';
  };
  video.onerror = () => { if (videoURL === url) { dropVideo(); toast('That video could not be opened. Try an MP4 or MOV file.'); } };
  video.src = url; video.load();
  // phones decode the first frame only once the video has been asked to play
  const p = video.play(); if (p && p.then) p.then(() => { if (audio.paused) video.pause(); }).catch(() => {});
}
function syncVideo(playing) {
  if (!videoOn || !(video.duration > 0)) return;
  if (playing && video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); }
  else if (!playing && !video.paused) video.pause();
  const want = audio.currentTime % video.duration;
  if (!video.seeking && Math.abs(video.currentTime - want) > (playing ? .3 : .05)) video.currentTime = want;
}

// The second picture, laid over the first. In Wave it is the ground behind the bars, so Behind is
// raised when it arrives; otherwise it would come in almost invisible.
const NO_OVER = 'None. Lay one over the first.';
function loadOverFile(file) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => {
    uploadOver(img, img.naturalWidth, img.naturalHeight);
    G.layer = true;
    if (P.behind < .45) P.behind = .6;
    drawThumb(img, img.naturalWidth, img.naturalHeight, el.thumb2);
    el.img2Name.textContent = file.name || 'Image';
    syncUI();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened. Try a JPG, PNG or WebP.'); };
  img.src = url;
}
function clearOver() {
  G.layer = false;
  el.img2Name.textContent = NO_OVER;
  el.thumb2.getContext('2d').clearRect(0, 0, 96, 96);
  syncUI();
}

function loadImageFile(file) {
  const url = URL.createObjectURL(file), img = new Image();
  img.onload = () => { dropVideo(); uploadImage(img, img.naturalWidth, img.naturalHeight); el.imgName.textContent = file.name || 'Image'; URL.revokeObjectURL(url); };
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
  else if (isVideo(f)) { loadVideoFile(f); loadSoundFile(f); }   // a dropped video is the picture and the sound
  else if (t.indexOf('audio/') === 0 || /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|aiff?)$/.test(n)) loadSoundFile(f);
  else toast('Drop an image (JPG, PNG, WebP), a video (MP4, MOV) or a sound (MP3, WAV, M4A).');
}

let prevNow = performance.now();
function frame(now) {
  const dt = Math.min(.05, Math.max(.001, (now - prevNow) / 1000)); prevNow = now;
  const playing = !audio.paused;
  if (playing) G.clock += dt;
  analyse(dt);
  syncVideo(playing);
  autoTick(playing);
  handTick(dt);
  step(dt);
  render(now);
  updateHUD(audio, scrubbing);
  recordTick(now);
  adaptQuality(dt, now, SESSION.active);
  requestAnimationFrame(frame);
}

// Test hook: tests/sim.test.mjs sets window.__MS_TEST__ to read live values. Inert otherwise.
if (window.__MS_TEST__) window.__ms = { U, V, S, G, A, PUMP, BEAT, WV, HAND };
boot();
