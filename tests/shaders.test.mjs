// Compiles both shaders with headless WebGL1 and renders every mode × a few directions into
// tests/out/modes.png so you can eyeball changes. Fails on compile errors, GL errors or black frames.
// Linux needs a virtual display:  xvfb-run -a npm run test:shaders
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { VS, mainFS, postFS } from '../src/gl/shaders.js';
import { DIRS, MODES } from '../src/config.js';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const W = 180, H = 320;
const gl = require('gl')(W, H, { preserveDrawingBuffer: true });
if (!gl) { console.error('No WebGL context. On Linux run: xvfb-run -a npm run test:shaders'); process.exit(1); }
const prec = 'precision highp float;\n';
function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); process.exit(1); }
  return s;
}
function program(fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); process.exit(1); }
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const MAIN = program(mainFS(prec)), POST = program(postFS(prec));
console.log('shaders compiled');

const src = PNG.sync.read(readFileSync(new URL('./fixtures/sample.png', import.meta.url)));
const S = src.width, data = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const si = ((S - 1 - y) * S + x) * 4, di = (y * S + x) * 4; for (let c = 0; c < 4; c++) data[di + c] = src.data[si + c]; }
const img = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, img);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data); gl.generateMipmap(gl.TEXTURE_2D);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
const wave = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, wave);
const wd = new Uint8Array(256 * 4);
for (let i = 0; i < 256; i++) { wd[i * 4 + 1] = 255 * (.12 + .88 * Math.abs(Math.sin(i * .37)) * (.35 + .65 * Math.abs(Math.sin(i * .06)))); wd[i * 4 + 3] = 255; }
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, wd);
for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
function target() {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f };
}
const T = [target(), target()];
const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

const rows = ['Neon', 'Original', 'Gold', 'LSD'];   // LSD row turns the trip layer on
const out = new PNG({ width: W * MODES.length, height: H * rows.length });
let failed = 0;
rows.forEach((dir, ry) => MODES.forEach((name, mode) => {
  const D = DIRS[dir], pal = D.pal.map(hex);
  for (const t of T) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  let last = 0;
  for (let f = 0; f < 12; f++) {
    const s = T[last], d = T[1 - last];
    gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, W, H); gl.useProgram(MAIN.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, img); gl.uniform1i(MAIN.u.uImg, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(MAIN.u.uPrev, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, wave); if (MAIN.u.uWave) gl.uniform1i(MAIN.u.uWave, 2);
    const f1 = (n, v) => { if (MAIN.u[n]) gl.uniform1f(MAIN.u[n], v); };
    gl.uniform2f(MAIN.u.uRes, W, H); gl.uniform2f(MAIN.u.uDrift, .1, -.05);
    if (MAIN.u.uTilt) gl.uniform2f(MAIN.u.uTilt, .25, -.12);
    if (MAIN.u.uJulia) gl.uniform2f(MAIN.u.uJulia, .7885 * Math.cos(2.2), .7885 * Math.sin(2.2));
    ['uP0', 'uP1', 'uP2', 'uP3'].forEach((n, i) => MAIN.u[n] && gl.uniform3fv(MAIN.u[n], pal[i]));
    if (MAIN.u.uBg) gl.uniform3fv(MAIN.u.uBg, hex('#0b0c12'));
    if (MAIN.u.uPoke) gl.uniform3fv(MAIN.u.uPoke, [.05, .1, .35]);
    if (MAIN.u.uEchoTex) gl.uniform1i(MAIN.u.uEchoTex, 1);
    const trip = dir === 'LSD';
    const U = { uAspect: .8, uT: 1 + f * .05, uMode: mode, uSeg: 6, uZoom: 1, uRot: .4, uWarp: mode === 4 ? .5 : .25, uTwist: .3, uTrail: .3,
      uHue: 0, uChroma: 1.2, uBright: 1, uContrast: 1.1, uSat: 1.1, uTunZ: .7, uFb: 1.004, uFbRot: .001,
      uPalMix: D.mix, uPalPhase: .1, uSlice: 0, uSliceSeed: 12.3, uHolo: .84, uBands: 1.1, uSparkle: .9, uBump: .6, uPokeAmp: .9,
      uWaveAmp: .6, uWaveT: .4, uWaveN: 40, uWaveBehind: .12,
      uLattice: trip ? .6 : 0, uLatScale: 11, uLatWarp: mode % 2 ? 1 : 0, uEcho: trip ? .3 : 0, uBreath: trip ? .5 : 0 };
    for (const k in U) f1(k, U[k]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(POST.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.t); gl.uniform1i(POST.u.uTex, 0);
    gl.uniform2f(POST.u.uRes, W, H); gl.uniform1f(POST.u.uT, f * .016); gl.uniform1f(POST.u.uGrain, D.grain); gl.uniform1f(POST.u.uVig, .55); gl.uniform1f(POST.u.uGlow, D.glow);
    if (POST.u.uTape) gl.uniform1f(POST.u.uTape, mode === 8 ? .9 : 0);
    if (POST.u.uTapeHit) gl.uniform1f(POST.u.uTapeHit, .6);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    last = 1 - last;
  }
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
  const mean = sum / (W * H * 3), err = gl.getError();
  const ok = err === 0 && mean > 8;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${dir.padEnd(8)} ${name.padEnd(8)} mean ${mean.toFixed(1)}${err ? ' glError ' + err : ''}`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((H - 1 - y) * W + x) * 4, di = ((ry * H + y) * W * MODES.length + mode * W + x) * 4;
    out.data[di] = px[si]; out.data[di + 1] = px[si + 1]; out.data[di + 2] = px[si + 2]; out.data[di + 3] = 255;
  }
}));
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/modes.png', import.meta.url), PNG.sync.write(out));
console.log('wrote tests/out/modes.png');
process.exit(failed ? 1 : 0);
