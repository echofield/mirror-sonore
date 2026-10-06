// WebGL1 renderer: two programs, ping-pong feedback targets, mipmapped image texture.
import { VS, mainFS, postFS } from './shaders.js';
import { G, P, V, S, U } from '../state.js';

let gl, MAIN, POST, imgTex, aniso, fbType, targets = [], last = 0, rw = 0, rh = 0;
let onThumb = null;

export function initRenderer(canvas, thumbCb) {
  onThumb = thumbCb;
  gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return 'This browser could not start WebGL, which the visuals need. Try Chrome, Safari or Firefox on a recent device.';
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const prec = (hp && hp.precision > 0) ? 'precision highp float;\n' : 'precision mediump float;\n';
  try { MAIN = program(mainFS(prec)); POST = program(postFS(prec)); }
  catch (e) { console.error(e); return 'The visual engine failed to start on this device.'; }

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  fbType = detectHalfFloat();
  imgTex = gl.createTexture();
  aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  return null;
}

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
const u1 = (pr, n, v) => { const l = pr.u[n]; if (l) gl.uniform1f(l, v); };
const u2 = (pr, n, a, b) => { const l = pr.u[n]; if (l) gl.uniform2f(l, a, b); };
const u3 = (pr, n, v) => { const l = pr.u[n]; if (l) gl.uniform3f(l, v[0], v[1], v[2]); };
const ui1 = (pr, n, v) => { const l = pr.u[n]; if (l) gl.uniform1i(l, v); };

// Half-float feedback keeps long trails from leaving 8-bit ghosts; falls back to bytes.
function detectHalfFloat() {
  const hf = gl.getExtension('OES_texture_half_float');
  const hfl = gl.getExtension('OES_texture_half_float_linear');
  gl.getExtension('EXT_color_buffer_half_float');
  if (!hf || !hfl) return gl.UNSIGNED_BYTE;
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, hf.HALF_FLOAT_OES, null);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); gl.deleteTexture(t);
  return ok ? hf.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
}

function makeTarget(w, h) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, fbType, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { t, f };
}

// Resize the drawing buffer and feedback targets. Cheap enough to call on format or scale changes.
export function setRenderSize(canvas, w, h) {
  if (w === rw && h === rh && targets.length) return;
  rw = w; rh = h;
  canvas.width = w; canvas.height = h;
  targets.forEach(x => { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); });
  targets = [makeTarget(w, h), makeTarget(w, h)];
  last = 0;
}

// Draw any image source into a power-of-two square so it can mipmap (no seams when tiled small).
export function uploadImage(src, w, h) {
  const size = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096 ? 2048 : 1024;
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(src, 0, 0, size, size);
  gl.bindTexture(gl.TEXTURE_2D, imgTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  G.imgAspect = w / h;
  if (onThumb) onThumb(src, w, h);
}

export function render(now) {
  const src = targets[last], dst = targets[1 - last];
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f);
  gl.viewport(0, 0, rw, rh);
  gl.useProgram(MAIN.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, imgTex); ui1(MAIN, 'uImg', 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src.t); ui1(MAIN, 'uPrev', 1);
  u2(MAIN, 'uRes', rw, rh); u2(MAIN, 'uDrift', U.dx, U.dy); u2(MAIN, 'uTilt', U.tx, U.ty); u2(MAIN, 'uJulia', U.jx, U.jy);
  u3(MAIN, 'uP0', G.pal[0]); u3(MAIN, 'uP1', G.pal[1]); u3(MAIN, 'uP2', G.pal[2]); u3(MAIN, 'uP3', G.pal[3]); u3(MAIN, 'uBg', G.bg);
  u3(MAIN, 'uPoke', S.poke);
  u1(MAIN, 'uAspect', G.imgAspect); u1(MAIN, 'uT', S.t); u1(MAIN, 'uMode', P.mode); u1(MAIN, 'uSeg', Math.round(P.seg));
  u1(MAIN, 'uZoom', U.zoom); u1(MAIN, 'uRot', S.rot); u1(MAIN, 'uWarp', U.warp); u1(MAIN, 'uTwist', U.twist);
  u1(MAIN, 'uTrail', U.trail); u1(MAIN, 'uHue', U.hue); u1(MAIN, 'uChroma', U.chroma); u1(MAIN, 'uBright', U.bright);
  u1(MAIN, 'uContrast', U.contrast); u1(MAIN, 'uSat', U.sat); u1(MAIN, 'uTunZ', S.tun); u1(MAIN, 'uFb', U.fb);
  u1(MAIN, 'uFbRot', U.fbRot); u1(MAIN, 'uPalMix', V.palMix); u1(MAIN, 'uPalPhase', S.palPhase);
  u1(MAIN, 'uSlice', U.slice); u1(MAIN, 'uSliceSeed', S.sliceSeed); u1(MAIN, 'uHolo', U.holo); u1(MAIN, 'uBands', V.bands);
  u1(MAIN, 'uSparkle', U.sparkle); u1(MAIN, 'uBump', V.bump); u1(MAIN, 'uPokeAmp', U.pokeAmp);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, rw, rh);
  gl.useProgram(POST.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dst.t); ui1(POST, 'uTex', 0);
  u2(POST, 'uRes', rw, rh); u1(POST, 'uT', now / 1000); u1(POST, 'uGrain', U.grain); u1(POST, 'uVig', .55); u1(POST, 'uGlow', U.glow);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  last = 1 - last;
}
