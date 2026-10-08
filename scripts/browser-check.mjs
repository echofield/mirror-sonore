// A check in a real browser: drives the built page in headless Edge through its debugging port, in real
// time (sound and video do not advance under a virtual time budget). It found what the jsdom suite could
// not: a wrong tempo on the sample loop, and whether a rendered clip is a real MP4.
//
// Usage (Git Bash on Windows):
//   node scripts/browser-check.mjs <msedge.exe> <url> <profile dir> <steps.json> [out.png] [port] [width] [height] [mobile 0|1] [light|dark]
// The page gets window.__MS_TEST__ = true, so window.__ms (state, the take, the recorder's test hooks) is there.
// Steps: { js, wait } runs a script in the page (its value is printed), { click: sel, fx, fy } presses the real
// mouse on an element at a fraction of its box, { drag: sel, fx, fy, tx, ty } drags inside it, { shot: file } saves
// a screenshot ({ clip: sel } limits it to one element), { save: expr, file } writes a base64 string the page returns.
// The browser is this script's own process and is ended by it.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const [, , edge, url, profile, stepsFile, outPng = '', port = '9340', w = '390', h = '844', mobile = '1', scheme = 'light'] = process.argv;
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'));
const p = spawn(edge, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ws = null;
for (let i = 0; i < 60 && !ws; i++) {
  try { const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl; } catch (e) { /* not up yet */ }
  if (!ws) await wait(250);
}
if (!ws) { console.log('no page found'); p.kill(); process.exit(1); }
const sock = new WebSocket(ws);
await new Promise(r => { sock.onopen = r; });
let id = 0; const errors = [];
sock.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.text + ' ' + ((m.params.exceptionDetails.exception || {}).description || '')).slice(0, 300)); });
const send = (method, params = {}) => new Promise(res => { const my = ++id;
  const hh = ev => { const m = JSON.parse(ev.data); if (m.id === my) { sock.removeEventListener('message', hh); res(m.result || m.error); } };
  sock.addEventListener('message', hh); sock.send(JSON.stringify({ id: my, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r && r.exceptionDetails) return 'EXC: ' + ((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text).slice(0, 300); return r && r.result ? r.result.value : r; };
const box = async sel => JSON.parse(await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify({ x: b.left, y: b.top, w: b.width, h: b.height }); })()`));
const mouse = (type, x, y, buttons) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: mobile === '1' });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__MS_TEST__ = true;' });
await send('Page.navigate', { url });
await wait(2500);
const out = [];
for (const s of steps) {
  if (s.js) out.push(await js(s.js));
  if (s.click) { const b = await box(s.click), x = b.x + b.w * (s.fx ?? .5), y = b.y + b.h * (s.fy ?? .5); await mouse('mousePressed', x, y, 1); await wait(40); await mouse('mouseReleased', x, y, 0); }
  if (s.drag) { const b = await box(s.drag), x0 = b.x + b.w * s.fx, y0 = b.y + b.h * (s.fy ?? .5), x1 = b.x + b.w * s.tx, y1 = b.y + b.h * (s.ty ?? s.fy ?? .5);
    await mouse('mousePressed', x0, y0, 1); for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, 1); await wait(30); } await mouse('mouseReleased', x1, y1, 0); }
  if (s.shot) { const clip = s.clip ? await box(s.clip) : null; writeFileSync(s.shot, Buffer.from((await send('Page.captureScreenshot', clip ? { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } } : { format: 'png' })).data, 'base64')); }
  if (s.save) { const b64 = await js(s.save); if (typeof b64 === 'string' && !b64.startsWith('EXC')) { writeFileSync(s.file, Buffer.from(b64, 'base64')); out.push('saved ' + s.file + ' (' + Math.round(b64.length * .75 / 1024) + ' KB)'); } else out.push('save failed: ' + String(b64).slice(0, 200)); }
  if (s.wait) await wait(s.wait);
}
if (outPng) writeFileSync(outPng, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
console.log(JSON.stringify({ out, errors }, null, 1));
sock.close();
p.kill();          // ends this browser process; its helper processes exit with it
await wait(400);
process.exit(0);
