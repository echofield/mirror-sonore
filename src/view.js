// Canvas sizing: output format/quality, plus an adaptive preview scale that drops resolution
// on slow devices while previewing, and goes back to full resolution for recording.
import { G, OUT } from './state.js';
import { FORMATS, QUALS } from './config.js';
import { setRenderSize } from './gl/renderer.js';

let canvas = null, slow = 0, fast = 0, upBlockedUntil = 0;
export function initView(cv) { canvas = cv; }

export function applySize() {
  const ar = FORMATS[OUT.fmt];
  G.W = QUALS[OUT.q];
  G.H = Math.round(G.W * ar[1] / ar[0] / 2) * 2;
  const root = document.documentElement.style;
  root.setProperty('--ar', ar[0] + '/' + ar[1]);
  root.setProperty('--arn', String(ar[0] / ar[1]));
  resize();
}
function resize() {
  const s = G.scale;
  setRenderSize(canvas, Math.round(G.W * s / 2) * 2, Math.round(G.H * s / 2) * 2);
}
export function setOutputScale(s) {
  if (s === G.scale) return;
  G.scale = s;
  resize();
}

// Called every frame with the frame time. Steps 1 → .75 → .5 when frames stay slow for 2 s.
export function adaptQuality(dt, now, recording) {
  if (recording) { slow = fast = 0; return; }
  if (dt > 1 / 45) { slow += dt; fast = 0; }
  else if (dt < 1 / 57) { fast += dt; slow = Math.max(0, slow - dt * .5); }
  if (slow > 2 && G.scale > .5) {
    setOutputScale(G.scale > .75 ? .75 : .5); slow = 0; upBlockedUntil = now + 20000;
  } else if (fast > 6 && G.scale < 1 && now > upBlockedUntil) {
    setOutputScale(G.scale < .75 ? .75 : 1); fast = 0;
  }
}
