// Runs the built page (dist/index.html) in jsdom with headless WebGL and a fake 120 BPM track
// (kick on every beat, snare on 2 and 4, hats on the off-beats, a breakdown from 8 s to 12 s).
// Checks tempo, hit and drop detection, Auto, the controls, trips, the Wave and VHS modes, the hands, kept looks, still images,
// full screen and multi-clip recording.
// Linux needs a virtual display:  xvfb-run -a npm run test:sim   (run `npm run build` first)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\n([\s\S]*)<\/script>/)[1];
const dom = new JSDOM(html.replace(/<script>[\s\S]*<\/script>/, ''), { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://miroir.test/' });
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
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob(['x'.repeat(900)])); };
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
  createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, smoothingTimeConstant: 0, connect() {}, getByteFrequencyData: spectrum,
    getByteTimeDomainData(arr) { const t = audioEl[0].currentTime, amp = (t >= 8 && t < 12) ? .12 : .3 + .7 * Math.exp(-(t % .5) / .09); for (let i = 0; i < arr.length; i++) arr[i] = 128 + 110 * amp * Math.sin(i * .21); } }; }
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
check(!Array.prototype.some.call($('dirs').children, b => /LSD|DMT/.test(b.textContent)), 'trip palettes are not listed as directions');
// trips
const tripBtn = n => Array.prototype.find.call($('trips').children, b => b.dataset.v === n);
let captures = 0;
for (const n of ['LSD', 'Psilocybin', 'DMT', 'Mescaline', 'Ayahuasca', 'Ketamine']) {
  click(tripBtn(n)); await run(1.5, () => { if (w.__ms.U.capture) captures++; });
  check($('lookBadge').textContent.startsWith(n) && $('tripDesc').textContent.length > 20 && w.__ms.V.lattice > .01,
    `trip ${n}: ${$('lookBadge').textContent} · pump ${w.__ms.PUMP.style}`);
}
check(captures > 10, 'tracers capture on the beat grid: ' + captures + ' captures');
check(w.__ms.G.arc > .5 && w.__ms.G.arc <= 1, 'Journey arc is active: ' + w.__ms.G.arc.toFixed(2));
click(Array.prototype.find.call($('dirs').children, b => b.dataset.v === 'Gold')); await run(.3);
check($('lookBadge').textContent.startsWith('Ketamine · Gold'), 'a direction can recolor a trip: ' + $('lookBadge').textContent);
click(tripBtn('None')); await run(2);
check(w.__ms.G.trip === null && w.__ms.V.lattice < .02 && w.__ms.V.echo < .02, 'Trip None turns the trip layer off');
for (const b of $('modes').children) { click(b); await run(.3); }
for (const b of $('miniModes').children) { click(b); await run(.1); }
click($('shuffle')); await run(.5);
for (const b of $('trans').children) { click(b); await run(.1); }
for (const b of $('fmts').children) { click(b); await run(.1); }
click($('fmts').children[0]);
for (const b of $('tabs').children) { click(b); }
check($('rack').dataset.tab === 'export', 'tabs switch the rack: ' + $('rack').dataset.tab);
// Wave: the song's level, bar by bar, crosses the picture from left to right like a train
const pressedIn = id => (Array.prototype.find.call($(id).children, b => b.getAttribute('aria-pressed') === 'true') || {}).textContent;
audioEl[0].currentTime = 1;      // in the groove, well before the breakdown, so the train is known
click(Array.prototype.find.call($('modes').children, b => b.textContent === 'Wave')); await run(3);
const wv = w.__ms.WV;
const labelOf = id => $(id).parentElement.querySelector('label').textContent;
check($('lookBadge').textContent.includes('Wave') && labelOf('segIn') === 'Bars' && labelOf('f-warp') === 'Height' && labelOf('f-spin') === 'Speed' && !$('wavefx').hidden,
  'Wave is selectable and names its faders Bars, Height, Speed, Behind: ' + $('lookBadge').textContent + ' · ' + $('segOut').textContent + ' bars');
const bars = w.__ms.U.waveN, train = Array.from(wv.hist.slice(1, bars + 1));
const loud = train.filter(v => v > .5).length, soft = train.filter(v => v < .35).length;
check(bars === 64 && loud > 8 && soft > 8, `Wave: the train holds the song's shape (${bars} bars across, ${loud} loud, ${soft} quiet)`);
const first = wv.hist[1]; let moved = false, born = false;
await run(.3, () => { if (wv.hist[2] === first || wv.hist[3] === first) moved = true; if (w.__ms.U.waveT > 0 && w.__ms.U.waveT < 1) born = true; });
check(moved && born, 'Wave: each bar leaves the left edge and travels right');
click($('modes').children[1]); await run(.2);
check(labelOf('segIn') === 'Folds' && labelOf('f-warp') === 'Warp' && $('wavefx').hidden, 'leaving Wave gives the faders their names back');
click(Array.prototype.find.call($('modes').children, b => b.textContent === 'Wave')); await run(.2);

check(['modes', 'miniModes'].every(id => Array.prototype.find.call($(id).children, b => b.textContent === 'Wave').classList.contains('hot')), 'Wave is marked in both mode pickers');

// a second picture laid over the first
w.Image = class { set src(v) { this.naturalWidth = 640; this.naturalHeight = 480; _st(() => this.onload && this.onload(), 0); } };
const pick = (id, file) => { Object.defineProperty($(id), 'files', { value: [file], configurable: true }); $(id).dispatchEvent(new w.Event('change')); };
check($('overBox').hidden && w.__ms.U.layer === 0, 'no second picture to begin with');
pick('img2In', new w.File(['x'], 'ink.png', { type: 'image/png' })); await tick(); await tick(); await run(1.2);
check(!$('overBox').hidden && $('img2Name').textContent === 'ink.png' && Math.abs(w.__ms.U.layer - .5) < .03 && w.__ms.V.behind > .5,
  'a second picture is laid over the first at 50%, and Wave shows it behind the bars (Behind ' + w.__ms.V.behind.toFixed(2) + ')');
click(Array.prototype.find.call($('blends').children, b => b.dataset.v === 'Multiply'));
check(w.__ms.G.blend === 'Multiply' && pressedIn('blends') === 'Multiply', 'the blend can be changed: ' + w.__ms.G.blend);
click($('img2Clear')); await run(.2);
check($('overBox').hidden && w.__ms.U.layer === 0 && !w.__ms.G.layer, 'removing it leaves the first picture alone');

// VHS: the mode brings the tape with it; the Tape fader lays it over any other mode
click(Array.prototype.find.call($('modes').children, b => b.textContent === 'VHS')); await run(.5);
check($('lookBadge').textContent.includes('VHS') && w.__ms.U.tape >= .85, 'VHS mode plays the picture through the tape (tape ' + w.__ms.U.tape.toFixed(2) + ')');
click($('modes').children[1]); await run(.3);
check(w.__ms.U.tape < .01, 'leaving VHS takes the tape off');
const tape = $('f-tape'); tape.value = '0.5'; tape.dispatchEvent(new w.Event('input')); await run(1);
check(Math.abs(w.__ms.U.tape - .5) < .03, 'the Tape fader lays tape over another mode (tape ' + w.__ms.U.tape.toFixed(2) + ')');
tape.value = '0'; tape.dispatchEvent(new w.Event('input'));

// the hands: keys and drags push offsets on top of the look; they spring back, or stay with Latch; Auto is left alone
const HAND = w.__ms.HAND;
const key = (type, k, o) => w.document.dispatchEvent(new w.KeyboardEvent(type, Object.assign({ key: k, bubbles: true }, o)));
const ptr = (type, x, y) => $('view').dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
if ($('autoT').getAttribute('aria-pressed') === 'false') click($('autoT'));
key('keydown', 'ArrowUp'); await run(.7);
check(HAND.v.zoom > .4 && $('pad').classList.contains('on'), 'holding the up arrow zooms in (hand ' + HAND.v.zoom.toFixed(2) + ')');
key('keyup', 'ArrowUp'); await run(1.6);
check(Math.abs(HAND.v.zoom) < .03 && !$('pad').classList.contains('on'), 'letting go springs back (hand ' + HAND.v.zoom.toFixed(3) + ')');
key('keydown', 'ArrowRight', { shiftKey: true }); await run(.5); key('keyup', 'ArrowRight');
check(HAND.v.trails > .3 && Math.abs(HAND.v.spin) < .01, 'Shift + arrow plays trails, not spin (trails ' + HAND.v.trails.toFixed(2) + ')');
await run(1.6);
click($('latchT2'));
key('keydown', 'ArrowRight'); await run(.5); key('keyup', 'ArrowRight'); await run(1.2);
check(HAND.v.spin > .35 && $('latchT').getAttribute('aria-pressed') === 'true', 'with Latch the hand stays where it was left (spin ' + HAND.v.spin.toFixed(2) + ')');
key('keydown', '0'); await run(.8);
check(Math.abs(HAND.v.spin) < .03, '0 brings the hands back to the centre');
click($('latchT2'));
const wasPaused = audioEl[0].paused;
ptr('pointerdown', 100, 100); ptr('pointermove', 130, 70); await run(.4);
check(HAND.v.spin > .3 && HAND.v.zoom > .3, 'dragging on the picture turns and zooms (' + HAND.v.spin.toFixed(2) + ', ' + HAND.v.zoom.toFixed(2) + ')');
ptr('pointerup', 130, 70); click($('view')); await run(1.6);
check(audioEl[0].paused === wasPaused && Math.abs(HAND.v.spin) < .03, 'a drag does not pause the sound, and the picture comes back');
ptr('pointerdown', 100, 100); ptr('pointerup', 100, 100); click($('view'));
check(audioEl[0].paused !== wasPaused, 'a tap on the picture still plays and pauses');
ptr('pointerdown', 100, 100); ptr('pointerup', 100, 100); click($('view')); await run(.2);
check($('autoT').getAttribute('aria-pressed') === 'true', 'the hands leave Auto on');

// kept looks: keep one, change everything, bring it back, remove it, undo
click($('dirs').children[2]); await run(.2);                                  // Neon
const warp = $('f-warp'); warp.value = '0.66'; warp.dispatchEvent(new w.Event('input'));
click(Array.prototype.find.call($('pumpStyle').children, b => b.dataset.v === 'Duck'));
beat.value = '1.2'; beat.dispatchEvent(new w.Event('input'));
click($('keepBtn')); await run(.2);
const stored = () => JSON.parse(w.localStorage.getItem('miroir-sonore.kept.v1') || '[]');
check($('kept').children.length === 2 && stored().length === 1, 'Keep adds a look to the row and to storage: ' + stored().map(k => k.name).join(', '));
check($('miniKept').children.length === 1 && !$('miniKept').hidden, 'the kept look is also in full screen');
click($('dirs').children[4]); click($('modes').children[2]); click($('pumpStyle').children[0]);
beat.value = '0.2'; beat.dispatchEvent(new w.Event('input')); warp.value = '0.1'; warp.dispatchEvent(new w.Event('input')); await run(.3);
click($('kept').children[1]); await run(.3);
check($('lookBadge').textContent.startsWith('Neon') && warp.value === '0.66' && beat.value === '1.2' && pressedIn('pumpStyle') === 'Duck'
  && $('autoT').getAttribute('aria-pressed') === 'false', 'a kept look brings back direction, look, Beat, pump and Auto: ' + $('lookBadge').textContent);
$('kept').children[1].dispatchEvent(new w.Event('pointerdown', { bubbles: true })); await tick(); await tick();
check($('kept').children.length === 1 && stored().length === 0, 'holding a kept look removes it');
click($('toast').querySelector('button')); await tick();
check($('kept').children.length === 2 && stored().length === 1, 'Undo puts it back');
beat.value = '0.8'; beat.dispatchEvent(new w.Event('input')); warp.value = '0.25'; warp.dispatchEvent(new w.Event('input'));

click($('fsBtn')); await run(.2);
check(w.document.body.classList.contains('immersive'), 'full screen opens');
w.document.body.classList.add('ui-off');
key('keydown', 'ArrowUp'); await run(.3); key('keyup', 'ArrowUp'); key('keydown', '3'); await run(.2);
check(w.document.body.classList.contains('ui-off') && HAND.v.zoom > .1, 'in full screen, playing with the keys leaves the picture clear');
w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true }));
check(!w.document.body.classList.contains('ui-off'), 'moving the pointer brings the controls back');
await run(1.6);
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
// still image
click($('shotBtn')); await run(.2);
const lastCard = $('results').lastChild;
check($('results').children.length === 5 && !!lastCard.querySelector('img') && /\.png$/.test(lastCard.querySelector('b').textContent)
  && lastCard.querySelector('.savebtn').textContent === 'Save image', 'Image saves a still as a PNG card: ' + lastCard.querySelector('small').textContent);
check(!!$('toast').querySelector('button'), 'the still can be saved from the message');
// the song read ahead: a real 32 s signal (a groove, a breakdown from 8 s, the drop at 12 s, then the same
// again) is decoded, scanned by the detectors through the FFT, and followed while it plays
const SR = 44100, DUR = 32, pcm = new Float32Array(SR * DUR);
{ let seed = 7, prevN = 0; const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR, tt = t % 16, brk = tt >= 8 && tt < 12, n = noise();
    const kick = brk ? 0 : Math.sin(2 * Math.PI * 55 * (tt % .5)) * Math.exp(-(tt % .5) / .07);
    const snare = brk ? 0 : n * .5 * Math.exp(-((tt + .5) % 1) / .06);
    const hat = (n - prevN) * .25 * Math.exp(-((tt + .25) % .5) / .03); prevN = n;
    pcm[i] = .8 * kick + snare + hat + .08 * Math.sin(2 * Math.PI * 220 * t);
  } }
w.OfflineAudioContext = class { decodeAudioData(ab, ok) { ok({ sampleRate: SR, length: pcm.length, duration: DUR, numberOfChannels: 1, getChannelData: () => pcm }); } };
audioEl[0].duration = DUR; audioEl[0].currentTime = 0;
const track = new w.File(['x'], 'track.wav', { type: 'audio/wav' });
if (!track.arrayBuffer) track.arrayBuffer = async () => new ArrayBuffer(8);
pick('sndIn', track);
for (let i = 0; i < 400 && !/ready|failed/.test(w.__ms.SONG.state); i++) await tick();
const sc = w.__ms.SONG.score || { hits: [], drops: [], rises: [] };
const kicksIn = sc.hits.filter(h => h.k === 'kick').length;
check(w.__ms.SONG.state === 'ready' && sc.bpm >= 118 && sc.bpm <= 122 && kicksIn > 36,
  `the song is read ahead: ${w.__ms.SONG.state}, ${sc.bpm} BPM, ${kicksIn} kicks, ${sc.hits.length} hits in ${DUR} s`);
check(sc.rises.length === 2 && sc.rises.every(d => Math.abs((d % 16) - 12.1) < .6), 'the two real drops are told from the hits inside the groove: rises at ' + sc.rises.map(d => d.toFixed(1)).join(', ') + ' s, of ' + sc.drops.length + ' drops');
const offBar = Math.abs(((sc.off + sc.bar / 2) % sc.bar) - sc.bar / 2);
check(Math.abs(sc.bar - 2) < .05 && offBar < .15, `bars are found: ${sc.bar.toFixed(2)} s long, the first one ${sc.off.toFixed(2)} s in`);
const cs = w.__ms.CLIP.start, onBar = Math.abs((((cs - sc.off) % sc.bar) + sc.bar + sc.bar / 2) % sc.bar - sc.bar / 2);
check(cs > 3 && cs < 10.3 && onBar < .02, `the clip is placed on a bar with the drop inside it: starts at ${cs.toFixed(2)} s`);
if (audioEl[0].paused) click($('playBtn'));
const k0 = counts.k, d0 = counts.d; audioEl[0].currentTime = 9.5;
await run(5);
check(counts.k - k0 >= 4 && counts.d - d0 >= 1 && /1(19|20|21) BPM/.test($('bpm').textContent),
  `playing follows the score: ${counts.k - k0} kicks and ${counts.d - d0} drop from 9.5 s to 14.5 s, ${$('bpm').textContent}`);
// a take, then the render. The browser is said to be able to encode, with a writer that draws every frame
// but writes no file: everything else (the take, the playback of the take, the way back) is the real thing.
const REC = w.__ms.rec, MS = w.__ms;
let drawn = 0;
REC.exact({ video: 'avc', audio: 'aac' }, async o => { for (let i = 0; i < o.frames; i++) { if (o.stopped()) return null; o.drawFrame(i); drawn++; if (i % 20 === 0) { o.onProgress(i / o.frames); await tick(); } } return new w.Blob(['v'.repeat(3000)]); });
REC.len(4);
click($('lens').children[0]);
check(!$('capRow').hidden && pressedIn('caps') === 'Perform' && $('recLbl').textContent.startsWith('Record'), 'with the song read and an encoder, Capture offers Perform: ' + $('recLbl').textContent);
click($('clips').children[0]);
if ($('autoT').getAttribute('aria-pressed') === 'false') click($('autoT'));
const cards0 = $('results').children.length;
click($('recBtn')); await run(.3);
check(REC.phase() === 'take' && $('recLbl').textContent === 'Finish the take' && /^TAKE 0:00 \/ 0:04/.test($('recTime').textContent), 'Record starts a take: ' + $('recTime').textContent);
click(Array.prototype.find.call($('dirs').children, b => b.dataset.v === 'Gold')); await run(.5);
warp.value = '0.8'; warp.dispatchEvent(new w.Event('input'));
key('keydown', 'ArrowUp'); await run(.6); key('keyup', 'ArrowUp'); await run(.5);
click($('shuffle')); await run(1);
const atEnd = () => ({ dir: MS.G.dir, mode: MS.P.mode, warp: MS.P.warp, zoom: MS.P.zoom, trails: MS.P.trails, auto: $('autoT').getAttribute('aria-pressed') });
await run(.9);
const took = atEnd(), evs = MS.TAKE.events;      // 3.8 s in: nothing more is played before the take ends at 4 s
await run(.4);
for (let i = 0; i < 600 && REC.phase(); i++) await tick();
check(evs.length > 4 && evs.some(e => e.hand) && evs.some(e => e.imp) && evs.some(e => e.g && e.g.dir === 'Gold') && Math.abs(MS.TAKE.len - 4) < .05,
  `the take wrote down what was played: ${evs.length} events over ${MS.TAKE.len.toFixed(2)} s (hands, looks, the direction)`);
const end = REC.lastEnd(), same = k => end.p[k] === MS.P[k];
check(drawn === 120 && end.g.dir === 'Gold' && ['mode', 'warp', 'zoom', 'trails', 'spin', 'glitch', 'punch', 'seg'].every(same),
  `the render drew ${drawn} frames and ended on the controls the take ended on (${end.g.dir}, mode ${end.p.mode}, warp ${end.p.warp})`);
const back = atEnd();
check(JSON.stringify(back) === JSON.stringify(took) && !MS.G.exact && !MS.HAND.replay && $('recLbl').textContent === 'Record 15s',
  'after the render the page is where the take left it: ' + JSON.stringify(back));
const card = $('results').lastChild;
check($('results').children.length === cards0 + 1 && /0:04 .* frame by frame$/.test(card.querySelector('small').textContent), 'the clip is listed: ' + card.querySelector('small').textContent);
click(Array.prototype.find.call($('caps').children, b => b.dataset.v === 'Instant'));
click($('clips').children[1]);
check($('recLbl').textContent === 'Render 3 clips · 15s', 'Instant renders without a take: ' + $('recLbl').textContent);
drawn = 0; click($('recBtn'));
for (let i = 0; i < 1500 && (REC.phase() || !i); i++) await tick();
check(drawn === 360 && $('results').children.length === cards0 + 4 && !MS.G.exact, `three clips rendered straight away: ${drawn} frames, ${$('results').children.length - cards0 - 1} new clips`);
click($('clips').children[0]); click(Array.prototype.find.call($('caps').children, b => b.dataset.v === 'Perform'));
REC.exact(null); REC.len(0);
check(errors.length === 0, 'no runtime errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log(failures ? failures + ' check(s) failed' : 'all checks passed');
process.exit(failures ? 1 : 0);
