// DOM: builds the controls, keeps them in sync with state, phone tabs, full screen, results list.
import { MODES, MARKED_MODES, FOLD_MODES, HOLO, WAVE, WAVEFX, WAVE_LABELS, BLENDS, LAYERFX, DIRS, MACROS, FEEL, TEX, FOIL, FORMATS, QUALS, LENS, CLIPS, BARS, TRANSITIONS, PUMP_STYLES, PUMP_LENGTHS, TRIPS, TRIP_NAMES, TRIPFX, ECHO_RATES } from './config.js';
import { P, G, A, V, BEAT, AUTO, OUT, SESSION, PUMP, HAND } from './state.js';
import { initHands, handKey, wasDrag, setLatch, centreHands } from './hands.js';
import { setDirection, setMode, shuffle, setAuto, setTrip } from './auto.js';
import { KEPT, keepLook, removeKept, restoreKept, applyKept } from './presets.js';

export const el = {};
const $ = id => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => v < a ? a : (v > b ? b : v);
let H = {};   // handlers from main.js
const faders = {};

export function initUI(handlers) {
  H = handlers;
  ['monitor', 'view', 'safe', 'lookBadge', 'bigPlay', 'bigPlayLbl', 'recBadge', 'recTime', 'recBar', 'recFill', 'exitFs',
   'side', 'playBtn', 'playIcon', 'scrub', 'tCur', 'tDur', 'macros', 'autoT', 'shuffle', 'fsBtn', 'miniDirs', 'miniModes', 'miniKept', 'recMini', 'recMiniLbl',
   'shotBtn', 'keepBtn', 'kept', 'keptNote', 'pad', 'latchT', 'latchT2', 'wavefx',
   'thumb2', 'img2Name', 'img2In', 'overBox', 'blends', 'overfx', 'img2Clear', 'songWave', 'bestBtn',
   'lKick', 'lSnare', 'lHat', 'lDrop', 'bpm', 'mLow', 'mMid', 'mHigh', 'tabs', 'rack', 'thumb', 'imgName', 'sndName', 'imgIn', 'sndIn',
   'trips', 'tripDesc', 'tripfx', 'echoRate', 'journeyT', 'miniTrips',
   'dirs', 'bars', 'trans', 'autoNote', 'pumpStyle', 'pumpLen', 'pumpNote', 'miniPump', 'modes', 'foldRow', 'segIn', 'segOut', 'feel', 'tex', 'foilWrap', 'foil',
   'fmts', 'quals', 'lens', 'clips', 'safeT', 'safeWrap', 'recBtn', 'recLbl', 'recNote', 'results', 'spec', 'drop', 'toast'
  ].forEach(id => { el[id] = $(id); });

  // directions: full chips in the rack, compact chips in the full-screen overlay
  Object.keys(DIRS).filter(n => !DIRS[n].hidden).forEach(name => {
    chip(el.dirs, name, true, () => setDirection(name));
    chip(el.miniDirs, name, true, () => setDirection(name));
  });
  TRIP_NAMES.forEach(name => {
    tripChip(el.trips, name, 'chip');
    tripChip(el.miniTrips, name, '');
  });
  Object.keys(ECHO_RATES).forEach(r => addBtn(el.echoRate, r, r, () => { G.echoRate = r; syncTrip(); }));
  el.journeyT.addEventListener('click', () => { G.journey = !G.journey; syncTrip(); });
  BARS.forEach(n => addBtn(el.bars, n, n + ' bars', () => { AUTO.bars = n; setAuto(true); }));
  TRANSITIONS.forEach(t => addBtn(el.trans, t, t, () => { AUTO.trans = t; pressed(el.trans, t); }));
  PUMP_STYLES.forEach(s => {
    addBtn(el.pumpStyle, s, s, () => setPump(s, PUMP.len));
    addBtn(el.miniPump, s, s === 'Off' ? 'Pump off' : 'Pump: ' + s, () => setPump(s, PUMP.len));
  });
  Object.keys(PUMP_LENGTHS).forEach(l => addBtn(el.pumpLen, l, l, () => setPump(PUMP.style, l)));
  MODES.forEach((name, i) => {
    const cls = MARKED_MODES.indexOf(i) >= 0 ? 'hot' : '';
    addBtn(el.modes, i, name, () => setMode(i), cls);
    addBtn(el.miniModes, i, name, () => setMode(i), cls);
  });

  buildFaders(el.macros, MACROS, 'macro');
  buildFaders(el.feel, FEEL, 'look');
  buildFaders(el.tex, TEX, null);
  buildFaders(el.foil, FOIL, null);
  buildFaders(el.tripfx, TRIPFX, null);
  buildFaders(el.wavefx, WAVEFX, null);
  buildFaders(el.overfx, LAYERFX, null);
  BLENDS.forEach(b => addBtn(el.blends, b, b, () => { G.blend = b; syncUI(); }));
  el.img2Clear.addEventListener('click', () => H.clearOver());
  el.segIn.addEventListener('input', () => {
    P.seg = parseInt(el.segIn.value, 10); el.segOut.textContent = P.mode === WAVE ? 8 * P.seg : P.seg; setFill(el.segIn);
    if (AUTO.on) setAuto(false);
  });

  Object.keys(FORMATS).forEach(v => addBtn(el.fmts, v, v, () => { if (SESSION.active) return; OUT.fmt = v; H.applySize(); syncExport(); }));
  Object.keys(QUALS).forEach(v => addBtn(el.quals, v, v, () => { if (SESSION.active) return; OUT.q = v; H.applySize(); syncExport(); }));
  Object.keys(LENS).forEach(v => addBtn(el.lens, v, v, () => { if (SESSION.active) return; OUT.len = v; H.lengthChanged(); syncExport(); }));
  el.bestBtn.addEventListener('click', () => H.bestClip());
  CLIPS.forEach(n => addBtn(el.clips, n, String(n), () => { if (SESSION.active) return; OUT.clips = n; syncExport(); }));
  el.safeT.addEventListener('change', syncExport);

  el.autoT.addEventListener('click', () => setAuto(!AUTO.on));
  el.shuffle.addEventListener('click', shuffle);
  el.fsBtn.addEventListener('click', () => setImmersive(true));
  el.exitFs.addEventListener('click', () => setImmersive(false));
  el.recBtn.addEventListener('click', H.toggleRecord);
  el.recMini.addEventListener('click', H.toggleRecord);
  el.shotBtn.addEventListener('click', H.takeStill);
  el.keepBtn.addEventListener('click', keep);
  renderKept();
  setFill(el.scrub);

  // phone tabs; a link ending in #look (or any tab's name) opens on that tab
  Array.prototype.forEach.call(el.tabs.children, b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  const want = (location.hash || '').slice(1);
  setTab(Array.prototype.some.call(el.tabs.children, b => b.dataset.tab === want) ? want : 'sources');

  // the hands: drag on the picture to play it; Latch keeps them where they are left
  const latches = [el.latchT, el.latchT2];
  initHands(el.view, el.pad, on => latches.forEach(b => b.setAttribute('aria-pressed', String(on))));
  latches.forEach(b => b.addEventListener('click', () => setLatch(!HAND.latch)));
  // after the mouse has moved a fader, give the arrow keys back to the hands
  document.addEventListener('pointerup', e => { const t = e.target; if (t && t.tagName === 'INPUT' && t.type === 'range' && e.pointerType === 'mouse') t.blur(); });

  // monitor: tap plays/pauses (a drag does not); in full screen it shows/hides the overlay instead
  el.monitor.addEventListener('click', e => {
    if (e.target !== el.view || wasDrag()) return;
    if (document.body.classList.contains('immersive')) { toggleOverlay(); return; }
    H.togglePlay();
  });
  el.bigPlay.addEventListener('click', e => { e.stopPropagation(); H.togglePlay(); });
  el.playBtn.addEventListener('click', H.togglePlay);
  // in full screen only the pointer brings the controls back: keys are for playing, and the picture stays clear
  ['pointermove', 'pointerdown'].forEach(t => document.addEventListener(t, poke, { passive: true }));
  document.addEventListener('keydown', e => { if (e.key === 'Tab') poke(e); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('immersive') && fsByApi) setImmersive(false); });
  document.addEventListener('webkitfullscreenchange', () => { if (!document.webkitFullscreenElement && document.body.classList.contains('immersive') && fsByApi) setImmersive(false); });

  el.imgIn.addEventListener('change', e => { const f = e.target.files[0]; if (f) H.loadPictureFile(f); e.target.value = ''; });
  el.sndIn.addEventListener('change', e => { const f = e.target.files[0]; if (f) H.loadSoundFile(f); e.target.value = ''; });
  el.img2In.addEventListener('change', e => { const f = e.target.files[0]; if (f) H.loadOverFile(f); e.target.value = ''; });
  initDrop();
  initKeys();
  syncExport();
}

function addBtn(group, v, label, fn, cls) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.v = String(v);
  if (cls) b.className = cls;
  if (typeof label === 'string') b.textContent = label; else b.appendChild(label);
  b.addEventListener('click', fn); group.appendChild(b); return b;
}
function chip(group, name, swatch, fn) {
  const f = document.createDocumentFragment();
  if (swatch) {
    const sw = document.createElement('span'); sw.className = 'sw'; sw.dataset.dir = name;
    const D = DIRS[name];
    sw.style.background = D.sw || (D.pal ? `linear-gradient(135deg,${D.pal[1]},${D.pal[2]} 55%,${D.pal[3]})` : 'var(--line)');
    f.appendChild(sw);
  }
  f.appendChild(document.createTextNode(name));
  return addBtn(group, name, f, fn, group === el.dirs ? 'chip' : '');
}
function tripChip(group, name, cls) {
  const f = document.createDocumentFragment(), sw = document.createElement('span'), T = TRIPS[name];
  sw.className = 'sw';
  sw.style.background = T ? `conic-gradient(${T.pal[1]},${T.pal[2]},${T.pal[3]},${T.pal[1]})` : 'var(--line)';
  f.appendChild(sw); f.appendChild(document.createTextNode(name));
  return addBtn(group, name, f, () => setTrip(name), cls);
}
export function updatePictureSwatch() {
  if (!G.picturePal) return;
  document.querySelectorAll('.sw[data-dir="Picture"]').forEach(s => { s.style.background = G.picturePal.css; });
}
function pressed(group, value) {
  Array.prototype.forEach.call(group.children, b => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
}
function setFill(input) { input.style.setProperty('--f', String((input.value - input.min) / (input.max - input.min))); }

// kind: 'macro' (stacked layout, never turns Auto off), 'look' (turns Auto off), null (color/texture)
function buildFaders(container, defs, kind) {
  defs.forEach(d => {
    const row = document.createElement('div');
    const id = 'f-' + d.k;
    row.className = kind === 'macro' ? 'macro' : 'fader';
    row.innerHTML = `<label for="${id}">${d.label}</label><input id="${id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}"><output for="${id}"></output>`;
    if (d.hint) row.title = d.hint;
    const input = row.querySelector('input'), out = row.querySelector('output');
    input.addEventListener('input', () => {
      P[d.k] = parseFloat(input.value);
      // the same key can appear twice (none today), so update every copy
      faders[d.k].forEach(f => { f.input.value = P[d.k]; f.out.textContent = d.fmt(P[d.k]); setFill(f.input); });
      G.easeTau = .08;
      if (kind === 'look' && AUTO.on) setAuto(false);
    });
    (faders[d.k] = faders[d.k] || []).push({ input, out, d, lab: row.querySelector('label') });
    container.appendChild(row);
  });
}

export function syncUI() {
  pressed(el.dirs, G.dir); pressed(el.miniDirs, G.dir);
  pressed(el.modes, P.mode); pressed(el.miniModes, P.mode);
  el.foldRow.hidden = FOLD_MODES.indexOf(P.mode) < 0;
  el.foilWrap.hidden = P.mode !== HOLO;
  // Wave names three faders for what they do there: Bars, Height, Speed; and brings its own, Behind
  const wave = P.mode === WAVE;
  el.wavefx.hidden = !wave;
  el.foldRow.querySelector('label').textContent = wave ? 'Bars' : 'Folds';
  Object.keys(WAVE_LABELS).forEach(k => faders[k].forEach(f => { f.lab.textContent = wave ? WAVE_LABELS[k] : f.d.label; }));
  el.segIn.value = P.seg; el.segOut.textContent = wave ? 8 * P.seg : P.seg; setFill(el.segIn);
  Object.keys(faders).forEach(k => faders[k].forEach(f => { f.input.value = P[k]; f.out.textContent = f.d.fmt(P[k]); setFill(f.input); }));
  el.lookBadge.textContent = (G.trip && G.dir !== G.trip ? G.trip + ' · ' : '') + G.dir + ' · ' + MODES[P.mode] + (AUTO.on ? ' · Auto' : '');
  syncPump();
  syncTrip();
}

const PUMP_NOTES = {
  Off: 'No pumping. The kick and bass no longer move the zoom or brightness; Beat and Flow still work.',
  Duck: 'Classic sidechain: on each kick the picture shrinks and dims, then swells back in time with the music.',
  Punch: 'On each kick the picture zooms in and flashes, then relaxes.',
  Breathe: 'The picture follows the bass smoothly, without a hard hit on the kick.'
};
function syncLayer() {
  el.overBox.hidden = !G.layer;
  pressed(el.blends, G.blend);
}
function syncTrip() {
  syncLayer();
  pressed(el.trips, G.trip || 'None'); pressed(el.miniTrips, G.trip || 'None');
  pressed(el.echoRate, G.echoRate);
  el.journeyT.setAttribute('aria-pressed', String(G.journey));
  el.tripDesc.textContent = G.trip ? TRIPS[G.trip].desc : 'No trip: the trip layer is off. Pick one to add its geometry, tracers, breathing and color.';
}
export function setPump(style, len) {
  PUMP.style = style; PUMP.len = len;
  syncPump();
}
function syncPump() {
  pressed(el.pumpStyle, PUMP.style); pressed(el.miniPump, PUMP.style); pressed(el.pumpLen, PUMP.len);
  const timed = PUMP.style === 'Duck' || PUMP.style === 'Punch';
  Array.prototype.forEach.call(el.pumpLen.children, b => { b.disabled = !timed; });
  el.pumpNote.textContent = PUMP_NOTES[PUMP.style] + (timed ? ` Each pump lasts ${PUMP.len} note.` : '');
}

export function setAutoUI() {
  el.autoT.setAttribute('aria-pressed', String(AUTO.on));
  pressed(el.bars, AUTO.on ? AUTO.bars : '');
  pressed(el.trans, AUTO.trans);
  el.autoNote.textContent = AUTO.on
    ? `Auto picks a new look on a kick every ${AUTO.bars} bars, and on drops, inside the direction. Beat and Flow stay yours. Editing the look turns Auto off.`
    : 'Auto is off, so your look stays as you set it. Turn it on to let the music pick new looks.';
  syncUI();
}

export function syncExport() {
  pressed(el.fmts, OUT.fmt); pressed(el.quals, OUT.q); pressed(el.lens, OUT.len); pressed(el.clips, OUT.clips);
  el.safeWrap.hidden = OUT.fmt !== '9:16';
  el.safe.hidden = !(el.safeT.checked && OUT.fmt === '9:16');
  el.spec.textContent = `${G.W} × ${G.H} · 30 fps` + (H.ext ? ' · ' + H.ext.toUpperCase() : '');
  if (!SESSION.active) {
    const len = OUT.len === 'Full' ? 'full track' : OUT.len;
    el.recLbl.textContent = OUT.clips > 1 ? `Record ${OUT.clips} clips · ${len}` : `Record ${len}`;
    el.bestBtn.textContent = OUT.len === 'Full' ? 'Best' : 'Best ' + OUT.len;
    el.recMiniLbl.textContent = 'Record ' + (OUT.len === 'Full' ? 'full' : OUT.len);
  }
}
export function lockExport(on) {
  [el.fmts, el.quals, el.lens, el.clips].forEach(g => Array.prototype.forEach.call(g.children, b => { b.disabled = on; }));
  el.scrub.disabled = on;
  el.playBtn.disabled = on || !H.soundReady();
}
export function setRecUI(on, n, total) {
  el.recBtn.classList.toggle('on', on); el.recMini.classList.toggle('on', on);
  el.recBadge.hidden = !on; el.recBar.hidden = !on;
  if (on) {
    el.recFill.style.transform = 'scaleX(0)';
    el.recLbl.textContent = total > 1 ? `Stop · clip ${n} of ${total}` : 'Stop recording';
    el.recMiniLbl.textContent = 'Stop';
    el.bigPlay.hidden = true;
  } else syncExport();
}

// Said once, the first time the sound plays: the picture can be played by hand.
let hinted = false;
function hintHands() {
  if (hinted) return;
  hinted = true;
  try { if (localStorage.getItem('miroir-sonore.hint.v1')) return; localStorage.setItem('miroir-sonore.hint.v1', '1'); } catch (e) { /* say it anyway */ }
  const fine = typeof matchMedia === 'function' && matchMedia('(pointer:fine)').matches;
  toast(fine ? 'Drag on the picture to play it, or hold the arrow keys.' : 'Drag on the picture to play it.');
}
export function setPlaying(playing) {
  if (playing) hintHands();
  el.playIcon.setAttribute('d', playing ? 'M5 3h3.5v14H5zM11.5 3H15v14h-3.5z' : 'M5 3l12 7-12 7z');
  el.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  if (playing) el.bigPlay.hidden = true;
}
export function setSoundReady(name) {
  el.sndName.textContent = name;
  el.playBtn.disabled = false; el.bigPlay.disabled = false; el.bigPlayLbl.textContent = 'Play';
  el.recBtn.disabled = !H.canRecord(); el.recMini.disabled = !H.canRecord();
}

// act: an optional { label, fn } button inside the message (Save, Undo).
let toastTimer = 0;
export function toast(msg, act) {
  el.toast.textContent = msg;
  if (act) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = act.label;
    b.addEventListener('click', () => { el.toast.hidden = true; act.fn(); });
    el.toast.appendChild(b);
  }
  el.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true; }, act ? 7000 : 4200);
}

// Kept looks: a row of small plates in the rack and in full screen. Tap brings one back, a hold removes it.
function keep() {
  const r = keepLook(el.view);
  renderKept(r.item.id);
  toast(!r.stored ? 'Kept until this page closes. This browser is not saving looks.'
    : r.dropped ? 'Look kept. The oldest one made room.' : 'Look kept: ' + r.item.name + '.');
}
function dropKept(k) {
  const r = removeKept(k.id);
  renderKept();
  toast('Removed ' + k.name + '.', { label: 'Undo', fn: () => { restoreKept(r); renderKept(k.id); } });
}
function renderKept(fresh) {
  [el.kept, el.miniKept].forEach(g => {
    g.textContent = '';
    if (g === el.kept) {
      const add = addBtn(g, 'add', 'Keep', keep, 'kt add');
      add.insertAdjacentHTML('afterbegin', '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.6"/></svg>');
      add.setAttribute('aria-label', 'Keep this look');
    }
    KEPT.forEach((k, i) => g.appendChild(keptTile(k, KEPT.length - i, k.id === fresh)));
  });
  el.miniKept.hidden = !KEPT.length;
  el.keptNote.textContent = KEPT.length
    ? 'Tap one to bring it back. Hold to remove it. Looks are kept in this browser.'
    : 'Keep a look and it waits here with its direction, mode, colour, Beat, Pump and Flow, ready for any picture.';
}
function keptTile(k, n, fresh) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'kt' + (fresh ? ' new' : '');
  b.title = k.name; b.setAttribute('aria-label', 'Bring back ' + k.name + '. Hold, or press Delete, to remove it.');
  if (k.thumb) b.style.backgroundImage = 'url("' + k.thumb + '")';
  const num = document.createElement('b'); num.textContent = (n < 10 ? '0' : '') + n; b.appendChild(num);
  let timer = 0, held = false, x0 = 0, y0 = 0;
  const cancel = () => { clearTimeout(timer); b.classList.remove('hold'); };
  b.addEventListener('pointerdown', e => {
    held = false; x0 = e.clientX; y0 = e.clientY; b.classList.add('hold');
    timer = setTimeout(() => { held = true; cancel(); dropKept(k); }, 600);
  });
  b.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 10) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, cancel));
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', () => { if (held) { held = false; return; } applyKept(k); });
  b.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dropKept(k); } });
  return b;
}

function setTab(t) {
  el.rack.dataset.tab = t;
  Array.prototype.forEach.call(el.tabs.children, b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
}

// Full screen: the CSS "immersive" layout always works (phones included); the Fullscreen API is a bonus where allowed.
let fsByApi = false, idleTimer = 0;
export function setImmersive(on) {
  document.body.classList.toggle('immersive', on);
  document.body.classList.remove('ui-off');
  if (on) {
    const st = $('stage');
    const req = st.requestFullscreen || st.webkitRequestFullscreen;
    fsByApi = false;
    if (req) { try { const p = req.call(st); fsByApi = true; if (p && p.catch) p.catch(() => { fsByApi = false; }); } catch (e) { fsByApi = false; } }
    poke();
  } else {
    clearTimeout(idleTimer);
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) { try { const p = exit.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    fsByApi = false;
  }
}
function toggleOverlay() { document.body.classList.toggle('ui-off'); if (!document.body.classList.contains('ui-off')) poke(); }
function poke(e) {
  if (!document.body.classList.contains('immersive')) return;
  if (e && e.target === el.view && (e.type === 'pointerdown' || e.buttons || e.pointerType === 'touch')) return;   // taps toggle, drags play
  document.body.classList.remove('ui-off');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (H.isPlaying()) document.body.classList.add('ui-off'); }, 3000);
}

// Results list: clips and still images, newest at the bottom, each with its own save button.
export function addResultCard(blob, name, info, first, kind) {
  const url = URL.createObjectURL(blob), still = kind === 'image';
  const card = document.createElement('div'); card.className = 'result';
  card.innerHTML = (still ? '<img alt="">' : '<video playsinline muted loop autoplay></video>')
    + '<div class="res-meta"><b></b><small></small><button class="savebtn" type="button">' + (still ? 'Save image' : 'Save video') + '</button><p class="note"></p></div>';
  const vid = card.querySelector('video,img'), msg = card.querySelector('.note'), btn = card.querySelector('.savebtn');
  vid.addEventListener('error', () => { vid.hidden = true; });
  vid.src = url;
  const vp = !still && vid.play && vid.play(); if (vp && vp.catch) vp.catch(() => {});
  card.querySelector('b').textContent = name;
  card.querySelector('small').textContent = info;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.textContent = await H.saveBlob(blob, name);
    btn.disabled = false;
  });
  el.results.appendChild(card);
  while (el.results.children.length > 10) {
    const old = el.results.firstChild, ov = old.querySelector('video,img');
    if (ov && ov.src) URL.revokeObjectURL(ov.src);
    el.results.removeChild(old);
  }
  if (first) {
    setTab('export');
    if (!document.body.classList.contains('immersive') && card.scrollIntoView) card.scrollIntoView({ block: 'nearest', behavior: G.reduced ? 'auto' : 'smooth' });
    else toast('Clip ready. Find it under Export.');
  }
}

export function drawThumb(src, w, h, canvas) {
  const g = (canvas || el.thumb).getContext('2d'), s = Math.min(w, h);
  g.clearRect(0, 0, 96, 96);
  g.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, 96, 96);
}

// Per-frame HUD: meters, hit lights, tempo, transport.
export function updateHUD(audio, scrubbing) {
  el.mLow.style.transform = 'scaleX(' + clamp(A.low * V.flow).toFixed(3) + ')';
  el.mMid.style.transform = 'scaleX(' + clamp(A.mid * V.flow).toFixed(3) + ')';
  el.mHigh.style.transform = 'scaleX(' + clamp(A.high * V.flow).toFixed(3) + ')';
  el.lKick.style.opacity = (.15 + .85 * A.kick).toFixed(2);
  el.lSnare.style.opacity = (.15 + .85 * A.snare).toFixed(2);
  el.lHat.style.opacity = (.15 + .85 * A.hat).toFixed(2);
  el.lDrop.style.opacity = (.15 + .85 * A.drop).toFixed(2);
  el.bpm.textContent = BEAT.bpm ? '≈ ' + BEAT.bpm + ' BPM' : '— BPM';
  if (isFinite(audio.duration) && audio.duration > 0) {
    el.tCur.textContent = fmt(audio.currentTime);
    if (!scrubbing) { el.scrub.value = Math.round(audio.currentTime / audio.duration * 1000); setFill(el.scrub); }
  }
}
export const fmt = s => { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + (r < 10 ? '0' : '') + r; };
export { setFill };

function initDrop() {
  let depth = 0;
  const hasFiles = e => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; el.drop.hidden = false; });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) el.drop.hidden = true; });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; el.drop.hidden = true;
    Array.prototype.forEach.call(e.dataTransfer.files, H.routeFile);
  });
}
function initKeys() {
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' && e.target.type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tag !== 'INPUT' && tag !== 'SELECT' && handKey(e, true)) { e.preventDefault(); return; }
    const k = e.key;
    if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); H.togglePlay(); }
    else if (k === 'r' || k === 'R') { if (!el.recBtn.disabled) H.toggleRecord(); }
    else if (k === '0') centreHands();
    else if (k === 'l' || k === 'L') setLatch(!HAND.latch);
    else if (k === 'i' || k === 'I') H.takeStill();
    else if (k === 'k' || k === 'K') keep();
    else if (k === 's' || k === 'S') shuffle();
    else if (k === 'a' || k === 'A') setAuto(!AUTO.on);
    else if (k === 't' || k === 'T') setTrip(TRIP_NAMES[(TRIP_NAMES.indexOf(G.trip || 'None') + 1) % TRIP_NAMES.length]);
    else if (k === 'p' || k === 'P') setPump(PUMP_STYLES[(PUMP_STYLES.indexOf(PUMP.style) + 1) % PUMP_STYLES.length], PUMP.len);
    else if (k === 'f' || k === 'F') setImmersive(!document.body.classList.contains('immersive'));
    else if (k === 'Escape' && document.body.classList.contains('immersive')) setImmersive(false);
    else if (/^[1-9]$/.test(k) && parseInt(k, 10) <= MODES.length) setMode(parseInt(k, 10) - 1);
  });
  document.addEventListener('keyup', e => { handKey(e, false); });
}
