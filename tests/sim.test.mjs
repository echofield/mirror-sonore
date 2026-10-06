// Runs the built page (dist/index.html) in jsdom with headless WebGL and a fake 120 BPM track
// (kick on every beat, snare on 2 and 4, hats on the off-beats, a breakdown from 8 s to 12 s).
// Checks tempo, hit and drop detection, Auto, the controls, full screen and multi-clip recording.
// Linux needs a virtual display:  xvfb-run -a npm run test:sim   (run `npm run build` first)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, errors = [];
w.addEventListener('error', e => errors.push(e.message));
let simNow = 1000, rafCb = null;
Object.defineProperty(w.performance, 'now', { value: () => simNow, configurable: true });
w.requestAnimationFrame = cb => { rafCb = cb; return 1; };
w.matchMedia = () => ({ matches: false });
w.URL.createObjectURL = () => 'blob:fake'; w.URL.revokeObjectURL = () => {};
const _st = w.setTimeout.bind(w); w.setTimeout = (fn, ms) => _st(fn, ms > 1000 ? ms : 0);

const glReal = require('gl')(108, 192, { preserveDrawingBuffer: true });
if (!glReal) { console.error('No WebGL context. On Linux run: xvfb-run -a npm run test:sim'); process.exit(1); }
const gl = new Proxy(glReal, { get(t, p) {
  if (p === 'texImage2D') return (...a) => a.length === 6 ? t.texImage2D(a[0], a[1], a[2], 4, 4, 0, a[3], a[4], new Uint8Array(64)) : t.texImage2D(...a);
  const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
const any = () => new Proxy(function () {}, { get: (t, p) => p === 'then' ? undefined : (p === Symbol.toPrimitive ? () => 0 : any()), apply: () => any(), set: () => true, construct: () => any() });
w.HTMLCanvasElement.prototype.getContext = function (type) { return type === 'webgl' ? gl : any(); };
w.HTMLCanvasElement.prototype.captureStream = () => ({ getVideoTracks: () => [{ stop() {} }] });
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
w.MediaStream = class { constructor(t) { this.t = t; } getVideoTracks() { return this.t.slice(0, 1); } getAudioTracks() { return this.t.slice(1); } };
let recorders = 0;
w.MediaRecorder = class { static isTypeSupported(m) { return m === 'video/mp4'; }
  constructor() { recorders++; this.state = 'inactive'; this.mimeType = 'video/mp4'; }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; setTimeout(() => { this.ondataavailable({ data: new w.Blob(['x'.repeat(2000)]) }); this.onstop(); }, 0); } };
const audioEl = [];
w.Audio = class extends w.EventTarget {
  constructor() { super(); this.paused = true; this.currentTime = 0; this.duration = 16; this.loop = false; this.src = ''; audioEl.push(this); }
  load() { setTimeout(() => this.dispatchEvent(new w.Event('loadedmetadata')), 0); }
  play() { this.paused = false; this.dispatchEvent(new w.Event('play')); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new w.Event('pause')); } } };
const hz = 48000 / 2048;
function spectrum(arr) {
  const t = audioEl[0].currentTime, brk = t >= 8 && t < 12;
  const ek = brk ? 0 : Math.exp(-(t % .5) / .07), es = brk ? 0 : Math.exp(-((t + .5) % 1) / .06), eh = Math.exp(-((t + .25) % .5) / .03);
  for (let i = 0; i < arr.length; i++) { const f = i * hz; let v = 30;
    if (f < 160) v = brk ? 25 : 110 + 140 * ek;
    else if (f > 300 && f < 2500) v = 95 + 10 * Math.random() + 60 * es * (f > 1000 ? 1 : 0);
    else if (f >= 2500 && f < 5000) v = 50 + 150 * es;
    else if (f > 6500 && f < 15000) v = 35 + 130 * eh;
    arr[i] = Math.max(0, Math.min(255, v)); } }
w.AudioContext = class { constructor() { this.sampleRate = 48000; this.state = 'running'; } resume() { return Promise.resolve(); }
  createMediaElementSource() { return { connect() {} }; }
  createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0, connect() {}, getByteFrequencyData: spectrum }; }
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{}] } }; } };
w.OfflineAudioContext = class { constructor() { return new Proxy(this, { get: (t, p) => p === 'startRendering'
  ? () => Promise.resolve({ numberOfChannels: 2, sampleRate: 44100, length: 100, getChannelData: () => new Float32Array(100) })
  : (p in t ? t[p] : any()), set: (t, p, v) => { t[p] = v; return true; } }); } };

w.__MS_TEST__ = true;
w.eval(script);
const $ = id => w.document.getElementById(id);
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const tick = () => new Promise(r => _st(r, 0));
const lightOn = { k: 0, s: 0, h: 0, d: 0 }, prev = {}, counts = { k: 0, s: 0, h: 0, d: 0 };
let lastLook = '', lookChanges = 0;
async function run(seconds, onFrame) {
  for (let i = 0, n = Math.round(seconds * 60); i < n; i++) {
    simNow += 1000 / 60; const a = audioEl[0];
    if (!a.paused) { a.currentTime += 1 / 60; if (a.currentTime >= a.duration) { if (a.loop) a.currentTime -= a.duration; else { a.currentTime = a.duration; a.pause(); a.dispatchEvent(new w.Event('ended')); } } }
    try { rafCb && rafCb(simNow); } catch (e) { errors.push('frame: ' + e.stack); return; }
    for (const [id, k, th] of [['lKick', 'k', .8], ['lSnare', 's', .8], ['lHat', 'h', .6], ['lDrop', 'd', .8]]) {
      const o = parseFloat($(id).style.opacity); if (o > th && !(prev[k] > th)) counts[k]++; prev[k] = o; }
    const L = $('lookBadge').textContent; if (L !== lastLook) { if (lastLook) lookChanges++; lastLook = L; }
    if (onFrame) onFrame();
    if (i % 4 === 0) await tick();
  }
}
let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) failures++; };

await tick(); await tick(); await tick();
check($('sndName').textContent === 'Sample loop · 120 BPM', 'sample loop loads: ' + $('sndName').textContent);
check(!$('bigPlay').disabled, 'play is enabled');
check($('lookBadge').textContent.startsWith('Picture'), 'starts in the Picture direction: ' + $('lookBadge').textContent);

click($('bigPlay'));
await run(40);
const bpm = parseInt(($('bpm').textContent.match(/\d+/) || ['0'])[0], 10);
check(bpm >= 118 && bpm <= 122, 'tempo ≈ 120 BPM: ' + $('bpm').textContent);
check(counts.k > 40, 'kicks detected: ' + counts.k);
check(counts.s > 20, 'snares detected: ' + counts.s);
check(counts.h > 40, 'hats detected: ' + counts.h);
check(counts.d >= 2, 'drops detected: ' + counts.d);
check(lookChanges >= 3, 'Auto changed the look: ' + lookChanges + ' times');

// macros never turn Auto off; look faders do
const beat = $('f-beat'); beat.value = '0'; beat.dispatchEvent(new w.Event('input'));
check($('autoT').getAttribute('aria-pressed') === 'true', 'Beat fader keeps Auto on');
await run(1);
const punch = $('f-punch'); punch.value = '0.3'; punch.dispatchEvent(new w.Event('input'));
check($('autoT').getAttribute('aria-pressed') === 'false', 'a Look fader turns Auto off');
// Pump: with Beat at 0 and Auto off, zoom only moves through the pump
beat.value = '0'; beat.dispatchEvent(new w.Event('input'));
await run(1.5);
async function zoomRange(style) {
  click(Array.prototype.find.call($('pumpStyle').children, b => b.dataset.v === style));
  audioEl[0].currentTime = .1; await run(.6);
  let mn = 1e9, mx = -1e9;
  await run(3, () => { const r = w.__ms.U.zoom / w.__ms.V.zoom; mn = Math.min(mn, r); mx = Math.max(mx, r); });
  return { mn, mx };
}
const off = await zoomRange('Off');
check(off.mx - off.mn < .01, `Pump Off: picture does not pump (zoom range ${(off.mx - off.mn).toFixed(3)})`);
check($('pumpLen').children[0].disabled, 'Pump length is disabled when Pump is off');
const duck = await zoomRange('Duck');
check(duck.mn < .95 && duck.mx < 1.005, `Pump Duck: shrinks on kicks and swells back (min ${duck.mn.toFixed(3)}, max ${duck.mx.toFixed(3)})`);
const punch2 = await zoomRange('Punch');
check(punch2.mx > 1.12, `Pump Punch: zooms in on kicks (max ${punch2.mx.toFixed(3)})`);
const breathe = await zoomRange('Breathe');
check(breathe.mx - breathe.mn > .02, `Pump Breathe: follows the bass (range ${(breathe.mx - breathe.mn).toFixed(3)})`);
click(Array.prototype.find.call($('pumpLen').children, b => b.dataset.v === '1/4'));
const quarter = await zoomRange('Duck');
check(quarter.mn < .95, `Pump length 1/4 works (min ${quarter.mn.toFixed(3)})`);
const pumpF = $('f-pump'); pumpF.value = '0'; pumpF.dispatchEvent(new w.Event('input')); await run(1);
const zeroAmt = await zoomRange('Punch');
check(zeroAmt.mx - zeroAmt.mn < .01, `Pump amount 0 stops pumping (range ${(zeroAmt.mx - zeroAmt.mn).toFixed(3)})`);
pumpF.value = '0.7'; pumpF.dispatchEvent(new w.Event('input'));
click(Array.prototype.find.call($('pumpLen').children, b => b.dataset.v === '1/8'));
beat.value = '0.8'; beat.dispatchEvent(new w.Event('input'));

for (const b of $('dirs').children) { click(b); await run(.2); }
for (const b of $('modes').children) { click(b); await run(.3); }
for (const b of $('miniModes').children) { click(b); await run(.1); }
click($('shuffle')); await run(.5);
for (const b of $('trans').children) { click(b); await run(.1); }
for (const b of $('fmts').children) { click(b); await run(.1); }
click($('fmts').children[0]);
for (const b of $('tabs').children) { click(b); }
check($('rack').dataset.tab === 'export', 'tabs switch the rack: ' + $('rack').dataset.tab);
click($('fsBtn')); await run(.2);
check(w.document.body.classList.contains('immersive'), 'full screen opens');
click($('exitFs')); await run(.2);
check(!w.document.body.classList.contains('immersive'), 'full screen closes');

click($('clips').children[1]);
check($('recLbl').textContent === 'Record 3 clips · 15s', 'record label: ' + $('recLbl').textContent);
click($('recBtn')); await run(1);
check(/clip 1 of 3/.test($('recLbl').textContent), 'recording clip 1 of 3');
await run(50); await tick(); await tick();
check($('results').children.length === 3, '3-clip session makes 3 clips: ' + $('results').children.length);
check($('recLbl').textContent === 'Record 3 clips · 15s', 'session ends cleanly');
click($('clips').children[2]); click($('recBtn')); await run(5); click($('recBtn')); await run(1); await tick(); await tick();
check($('results').children.length === 4 && $('recBadge').hidden, 'stopping mid-session keeps the clip and ends: ' + $('results').children.length);
check(errors.length === 0, 'no runtime errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
