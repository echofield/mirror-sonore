// Audio graph and analysis.
// <audio> element → MediaElementSource → Analyser → speakers (+ a MediaStreamDestination for recording).
// Each frame the engine needs the band envelopes and the hits (kick/snare/hat/drop). They come from one
// of two places: the score, when the song has been read ahead (audio/score.js), looked up at the sound's
// own position; or the detectors (audio/detect.js) listening to the sound as it plays.
import { A, BEAT, G, SONG } from '../state.js';
import { makeDetectors } from './detect.js';
import { followScore } from './score.js';

export const audio = new Audio();
audio.loop = true;
audio.preload = 'auto';

// Event hooks, wired in main.js.
export const on = { kick: null, snare: null, hat: null, drop: null };

let actx = null, analyser = null, recDest = null;
const live = makeDetectors(A, BEAT, on);
const mem = { t: -1, k: 0 };       // where the score was last read

// Must run inside a user gesture (iOS/Chrome autoplay rules). Safe to call repeatedly.
export function ensureCtx() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS 16.4+: play even on silent */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  actx = new AC();
  const src = actx.createMediaElementSource(audio);   // only once per element; changing src later is fine
  analyser = actx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = .3;
  src.connect(analyser);
  analyser.connect(actx.destination);
  if (actx.createMediaStreamDestination) { recDest = actx.createMediaStreamDestination(); analyser.connect(recDest); }
  live.configure(actx.sampleRate, analyser.fftSize);
}
export const recordStream = () => recDest && recDest.stream;

export function resetAnalysis() { live.reset(); mem.t = -1; }

// Once per frame while the page is live.
export function analyse(dt) {
  const playing = !audio.paused;
  if (playing && SONG.score) followScore(SONG.score, audio.currentTime, dt, A, BEAT, on, mem);
  else live.analyse(dt, G.clock, analyser, playing);
}
// The same reading at a chosen time, for a clip rendered frame by frame.
export function analyseAt(t, dt) { followScore(SONG.score, t, dt, A, BEAT, on, mem); }
