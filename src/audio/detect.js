// The detectors: band envelopes (low/mid/high/overall and the waveform's own level), spectral-flux
// onsets for kick/snare/hat, a tempo estimate from kick intervals, and drop detection (an energy
// jump after a quieter section), with all their memory.
// They read anything that answers like an AnalyserNode. One set listens to the live sound; another
// scans a whole track ahead of time (score.js), so both hear with the same ears.
const clamp = (v, a = 0, b = 1) => v < a ? a : (v > b ? b : v);

export function makeDetectors(A, BEAT, on) {
  let fbuf = null, tbuf = null, prevBuf = null, RG = null;
  // Onset detector: flux above an adaptive mean + k·deviation, with a minimum gap between hits.
  const det = (gap, k) => ({ mean: 0, dev: 0, last: -9, gap, k });
  const DET = { kick: det(.17, 1.6), snare: det(.13, 1.9), hat: det(.06, 1.5) };
  const avg = r => { let s = 0; for (let i = r[0]; i <= r[1]; i++) s += fbuf[i]; return s / ((r[1] - r[0] + 1) * 255); };
  const flux = r => { let s = 0; for (let i = r[0]; i <= r[1]; i++) { const d = fbuf[i] - prevBuf[i]; if (d > 0) s += d; } return s / ((r[1] - r[0] + 1) * 255); };
  function detect(d, x, t, dt) {
    const a = 1 - Math.exp(-dt / .9);
    const hit = x > d.mean + d.k * d.dev + .01 && (t - d.last) > d.gap;
    if (hit) d.last = t;
    d.mean += (x - d.mean) * a;
    d.dev += (Math.abs(x - d.mean) - d.dev) * a;
    return hit;
  }
  function trackTempo(t) {
    const ioi = t - BEAT.last; BEAT.last = t;
    if (ioi <= .24 || ioi >= 1.6) return;
    BEAT.iois.push(ioi); if (BEAT.iois.length > 16) BEAT.iois.shift();
    if (BEAT.iois.length < 4) return;
    let m = BEAT.iois.slice().sort((a, b) => a - b)[Math.floor(BEAT.iois.length / 2)];
    while (m > .75) m /= 2;
    while (m < .35) m *= 2;
    BEAT.period = m; BEAT.bpm = Math.round(60 / m);
  }

  return {
    // The source's sample rate and FFT size decide which bins make up each band.
    configure(sampleRate, fftSize) {
      const bins = fftSize / 2, hz = sampleRate / fftSize;
      fbuf = new Uint8Array(bins); tbuf = new Uint8Array(fftSize); prevBuf = new Uint8Array(bins);
      const idx = (lo, hi) => [Math.max(1, Math.floor(lo / hz)), Math.min(bins - 1, Math.ceil(hi / hz))];
      RG = { low: idx(35, 130), mid: idx(300, 2500), high: idx(5000, 14000), all: idx(35, 14000),
             kick: idx(35, 150), snare: idx(1000, 4500), hat: idx(7000, 15000) };
    },
    reset() {
      BEAT.iois = []; BEAT.bpm = 0; BEAT.last = -9;
      A.playT = 0; A.eSlow = 0; A.eFast = 0;
    },
    // One step. src is the sound; t the clock in seconds. With playing false every envelope falls.
    analyse(dt, t, src, playing) {
      let lo = 0, mi = 0, hi = 0, lv = 0, wv = 0;
      playing = !!(playing && src && RG);
      if (playing) {
        src.getByteFrequencyData(fbuf);
        const raw = [avg(RG.low), avg(RG.mid), avg(RG.high), avg(RG.all)];
        for (let i = 0; i < 4; i++) { A.pk[i] = Math.max(raw[i], A.pk[i] - dt * .04, .12); raw[i] /= A.pk[i]; }
        lo = clamp((raw[0] - .35) / .65); mi = clamp((raw[1] - .25) / .75); hi = clamp((raw[2] - .2) / .8); lv = clamp(raw[3]);
        // the waveform's own level, as a track's waveform display shows it: RMS against its running peak
        if (src.getByteTimeDomainData) {
          src.getByteTimeDomainData(tbuf);
          let s = 0;
          for (let i = 0; i < tbuf.length; i += 4) { const v = (tbuf[i] - 128) / 128; s += v * v; }
          const rms = Math.sqrt(s * 4 / tbuf.length);
          A.wpk = Math.max(rms, A.wpk - dt * .03, .04);
          wv = Math.pow(clamp((rms / A.wpk - .2) / .8), 1.25);
        } else wv = lv;
        if (detect(DET.kick, flux(RG.kick), t, dt) && raw[0] > .45) { A.kick = 1; trackTempo(t); on.kick && on.kick(); }
        if (detect(DET.snare, flux(RG.snare), t, dt)) { A.snare = 1; on.snare && on.snare(); }
        if (detect(DET.hat, flux(RG.hat), t, dt)) { A.hat = 1; on.hat && on.hat(); }
        prevBuf.set(fbuf);
        A.playT += dt;
      }
      const env = (cur, target, att, rel) => cur + (target - cur) * (1 - Math.exp(-dt / (target > cur ? att : rel)));
      A.low = env(A.low, lo, .012, .14); A.mid = env(A.mid, mi, .04, .3); A.high = env(A.high, hi, .01, .1); A.lvl = env(A.lvl, lv, .08, .6);
      A.wave = env(A.wave, wv, .008, .08);
      if (playing) {
        // Drop: bass-weighted energy jumps well above its recent average, after a 4 s warm-up.
        const dv = .6 * lo + .4 * lv;
        A.eFast = env(A.eFast, dv, .15, .25);
        A.eSlow = A.playT < 4 ? A.eFast : env(A.eSlow, dv, 3, 3);
        if (A.playT > 4 && A.eSlow > .1 && A.eFast > A.eSlow * 1.35 && A.eFast > .3 && t - A.lastDrop > 6) {
          A.lastDrop = t; A.drop = 1; on.drop && on.drop();
        }
      }
      A.kick *= Math.exp(-dt * 8); A.snare *= Math.exp(-dt * 10); A.hat *= Math.exp(-dt * 16);
      A.drop *= Math.exp(-dt * 2.5); A.cut *= Math.exp(-dt * 5);
    }
  };
}
