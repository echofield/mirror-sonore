// A 16 s, 120 BPM demo loop synthesised offline, so the page works before you add a sound.
// Bars 0–3 groove, 4–5 breakdown (no kick, bass or clap), 6–7 drop with a long kick and 16th hats.
export function makeSampleLoop() {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) return Promise.reject(new Error('no offline audio'));
  const sr = 44100, dur = 16, ctx = new OAC(2, sr * dur, sr);
  const master = ctx.createGain(); master.gain.value = .8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .2;
  master.connect(comp); comp.connect(ctx.destination);
  const noise = ctx.createBuffer(1, sr, sr), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const B = .5;

  function kick(t, len = .42) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .13);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(1, t + .004); g.gain.exponentialRampToValueAtTime(.001, t + len);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + len + .03);
  }
  function hat(t, v, len) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + len);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * .5); s.stop(t + len + .02);
  }
  function clap(t) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = .9;
    const g = ctx.createGain();
    [0, .012, .024].forEach(o => { g.gain.setValueAtTime(.55, t + o); g.gain.exponentialRampToValueAtTime(.08, t + o + .01); });
    g.gain.setValueAtTime(.4, t + .036); g.gain.exponentialRampToValueAtTime(.001, t + .25);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, .2); s.stop(t + .3);
  }
  function bass(t, f0, d) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(140, t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.32, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02);
  }
  function pad(t, fs, d) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + .8);
    g.gain.setValueAtTime(.06, t + d - .6); g.gain.exponentialRampToValueAtTime(.0001, t + d + .4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    lp.connect(g); g.connect(master);
    fs.forEach(f0 => [-7, 7].forEach(cents => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + d + .5);
    }));
  }
  function pluck(t, f0, v) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0;
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .005); g.gain.exponentialRampToValueAtTime(.0005, t + .28);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + .3);
  }

  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  const roots = [55, 43.65, 65.41, 49];
  for (let c = 0; c < 4; c++) pad(c * 4, chords[c], 4);
  for (let bar = 0; bar < 8; bar++) {
    const t0 = bar * 2, ci = Math.floor(bar / 2), brk = bar === 4 || bar === 5;
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * B;
      if (!brk) { kick(t, bar === 6 && b === 0 ? 1.1 : .42); bass(t + B / 2, roots[ci], .22); if (b % 2 === 1) clap(t); }
      hat(t + B / 2, brk ? .07 : .16, .05);
      if (bar >= 6) { hat(t + B / 4, .07, .03); hat(t + 3 * B / 4, .07, .03); }
    }
    if (bar >= 2) for (let s = 0; s < 8; s++) pluck(t0 + s * B / 2, chords[ci][s % 3] * 2, brk ? .1 : .06);
  }
  return new Promise((res, rej) => {
    ctx.oncomplete = e => res(e.renderedBuffer);
    try { const pr = ctx.startRendering(); if (pr && pr.then) pr.then(res, rej); } catch (err) { rej(err); }
  }).then(toWav);
}

export function toWav(buf) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
  const ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) {
    const s = Math.max(-1, Math.min(1, chans[k][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}
