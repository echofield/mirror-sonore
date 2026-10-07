// Boot and the frame loop. Order per frame: clock → analysis → Auto → mapping → render → HUD → recording.
import { G, P, A, SESSION, OUT, U, V, S, PUMP, BEAT, WV, HAND, SONG, CLIP } from './state.js';
import { decodeTrack, scanTrack, bestStart } from './audio/score.js';
import { LENS } from './config.js';
import { handTick } from './hands.js';
import { initSongBar, drawSongBar } from './songbar.js';
import { initRenderer, uploadImage, uploadOver, useVideo, render } from './gl/renderer.js';
import { audio, ensureCtx, analyse, analyseAt, on, resetAnalysis } from './audio/engine.js';
import { makeSampleLoop } from './audio/sample-loop.js';
import { makeSampleImage } from './image/sample-image.js';
import { extractPalette } from './image/palette.js';
import { step, reactKick, reactSnare } from './map.js';
import { setDirection, setAuto, autoTick, autoOnKick, autoOnDrop, applyPalette } from './auto.js';
import { initUI, el, toast, setPlaying, setSoundReady, updateHUD, updatePictureSwatch, drawThumb, setFill, syncExport, syncUI } from './ui.js';
import { initView, applySize, adaptQuality } from './view.js';
import { MIME, EXT, initRecord, canRecord, toggleRecord, recordTick, saveBlob, stopClip, takeStill, refreshExact, exactReady, pageHidden, TESTING } from './record.js';
import { exactSupport } from './exact.js';
import { TAKE } from './take.js';
import { DEFAULT_DIR } from './config.js';

let soundURL = null, soundReady = false, scrubbing = false;

// A video can be the picture. It plays muted and follows the sound's clock, so the same section
// of the track always shows the same frames (which keeps the clips of one session comparable).
const video = document.createElement('video');
video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
let videoURL = null, qualityChosen = false;

// One frame of the engine at a chosen moment of the song, with nothing read from the page's clocks.
// A clip rendered frame by frame is made of these (record.js).
function exactFrame(t, dt, ms, auto) {
  G.clock += dt;
  analyseAt(t, dt);
  if (auto) autoTick(true);
  handTick(dt);
  step(dt);
  render(ms);
}

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
  initRecord(canvas, exactFrame);
  initUI({
    togglePlay, routeFile, loadPictureFile, loadSoundFile, loadOverFile, clearOver, saveBlob, takeStill, exactReady,
    applySize: () => { qualityChosen = true; applySize(); refreshExact().then(syncExport); },
    lengthChanged: () => placeClip(CLIP.start),
    bestClip: () => { if (SONG.score && !SESSION.active) { placeClip(bestStart(SONG.score, LENS[OUT.len] || 0)); audio.currentTime = CLIP.start; } },
    toggleRecord: () => toggleRecord(soundReady),
    soundReady: () => soundReady, canRecord, isPlaying: () => !audio.paused, ext: MIME ? EXT : ''
  });
  if (!window.MediaRecorder || !canvas.captureStream) {
    el.recNote.textContent = 'Recording needs a browser that can capture video, such as Chrome, Edge, Firefox or Safari 14.1 and later.';
  }

  // the song bar: a tap or a drag places the clip (and the sound with it); with the whole track as length it only moves the sound
  initSongBar(el.songWave, audio, (start, seek, done) => {
    if (SESSION.active) return;
    CLIP.start = start;
    if (done && isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, seek);
  });

  on.kick = () => { reactKick(); autoOnKick(); };
  on.snare = reactSnare;
  on.drop = autoOnDrop;

  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { if (SESSION.active) stopClip(); });
  audio.addEventListener('error', () => { if (audio.src) toast('That sound could not be played. Try an MP3, WAV or M4A file.'); });
  audio.addEventListener('loadedmetadata', () => { el.tDur.textContent = fmtT(audio.duration); });
  el.scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  window.addEventListener('pointerup', () => { scrubbing = false; });
  el.scrub.addEventListener('change', () => { scrubbing = false; });
  el.scrub.addEventListener('input', () => {
    setFill(el.scrub);
    if (isFinite(audio.duration) && !SESSION.active) audio.currentTime = el.scrub.value / 1000 * audio.duration;
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pageHidden(); });

  const sample = makeSampleImage();
  uploadImage(sample, sample.width, sample.height);
  setDirection(DEFAULT_DIR);
  setAuto(true);
  applySize();
  syncExport();
  // A browser that can write the clip frame by frame gets full HD as the default, since the device's speed no longer matters.
  exactSupport(1080, 1920).then(c => { if (c && !qualityChosen && OUT.q === '720p') { OUT.q = '1080p'; applySize(); } return refreshExact(); }).then(syncExport);
  requestAnimationFrame(frame);
  makeSampleLoop().then(blob => {
    if (!soundReady) setSound(blob, 'Sample loop · 120 BPM');
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
  G.videoOn = false; video.pause();
  if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; video.removeAttribute('src'); video.load(); }
}
function loadVideoFile(file) {
  const url = URL.createObjectURL(file);
  dropVideo();
  videoURL = url;
  video.onloadeddata = () => {
    if (videoURL !== url || !video.videoWidth) return;
    G.videoOn = true;
    useVideo(video, video.videoWidth, video.videoHeight);
    el.imgName.textContent = file.name || 'Video';
  };
  video.onerror = () => { if (videoURL === url) { dropVideo(); toast('That video could not be opened. Try an MP4 or MOV file.'); } };
  video.src = url; video.load();
  // phones decode the first frame only once the video has been asked to play
  const p = video.play(); if (p && p.then) p.then(() => { if (audio.paused) video.pause(); }).catch(() => {});
}
function syncVideo(playing) {
  if (!G.videoOn || !(video.duration > 0)) return;
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
// Read the whole song ahead: decode it, then let the detectors go through it once (audio/score.js).
// Until that is done, and whenever it cannot be done, the sound is listened to as it plays.
let songSeq = 0;
async function readSong(blob) {
  const my = ++songSeq;
  Object.assign(SONG, { state: 'reading', progress: 0, buffer: null, score: null });
  el.bestBtn.disabled = true;
  try {
    const buffer = await decodeTrack(await blob.arrayBuffer());
    if (my !== songSeq) return;
    if (!(buffer.duration > 0) || buffer.duration > 900) throw new Error('too long to read ahead');
    const score = await scanTrack(buffer, p => { if (my === songSeq) SONG.progress = p; });
    if (my !== songSeq) return;
    Object.assign(SONG, { state: 'ready', progress: 1, buffer, score });
    syncExport();
    placeClip(bestStart(score, LENS[OUT.len] || 0));
    el.bestBtn.disabled = false;
    if (audio.paused) audio.currentTime = CLIP.start;
  } catch (e) {
    if (my === songSeq) Object.assign(SONG, { state: 'failed', buffer: null, score: null });
  }
}
// The clip follows the Length chosen under Export, and stays inside the track.
function placeClip(start) {
  const dur = SONG.score ? SONG.score.duration : audio.duration;
  CLIP.len = LENS[OUT.len] || 0;
  if (!isFinite(dur) || !(CLIP.len > 0) || CLIP.len >= dur) { CLIP.start = 0; return; }
  CLIP.start = Math.max(0, Math.min(dur - CLIP.len, start));
}

function setSound(blob, name) {
  const url = URL.createObjectURL(blob);
  const wasPlaying = !audio.paused;
  if (soundURL && soundURL !== url) URL.revokeObjectURL(soundURL);
  soundURL = url;
  audio.src = url; audio.load();
  soundReady = true;
  resetAnalysis();
  setSoundReady(name);
  CLIP.start = 0;
  readSong(blob);
  if (wasPlaying) audio.play().catch(() => {});
}
function loadSoundFile(file) { setSound(file, file.name || 'Sound'); }
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
  if (G.exact) { requestAnimationFrame(frame); return; }      // a clip is being rendered: the picture belongs to it
  const playing = !audio.paused;
  if (playing) G.clock += dt;
  // the clip plays in a loop, so what is heard is what a recording will hold
  if (playing && !SESSION.active && CLIP.len > 0 && isFinite(audio.duration) && CLIP.len < audio.duration - .05) {
    const end = Math.min(audio.duration, CLIP.start + CLIP.len);
    if (audio.currentTime >= end - .02 || audio.currentTime < CLIP.start - .05) audio.currentTime = CLIP.start;
  }
  analyse(dt);
  syncVideo(playing);
  autoTick(playing);
  handTick(dt);
  step(dt);
  render(now);
  updateHUD(audio, scrubbing);
  drawSongBar();
  recordTick(now);
  adaptQuality(dt, now, SESSION.active);
  requestAnimationFrame(frame);
}

// Test hook: tests/sim.test.mjs sets window.__MS_TEST__ to read live values. Inert otherwise.
if (window.__MS_TEST__) window.__ms = { U, V, S, G, A, P, PUMP, BEAT, WV, HAND, SONG, CLIP, OUT, TAKE, rec: TESTING };
boot();
