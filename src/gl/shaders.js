// GLSL ES 1.0 (WebGL1) so it runs on every phone. Two passes:
//   MAIN  — samples the image through the current mode's coordinate transform, grades it,
//           and blends with the previous frame (feedback trails). Renders into a ping-pong target.
//   POST  — glow, highlight roll-off, vignette, film grain. Renders to the canvas.
// Modes (uMode): 0 Mirror, 1 Kaleido, 2 Tunnel, 3 Liquid, 4 Holo, 5 Fractal, 6 Infinite.
// Unused uniforms are fine: the renderer skips locations the compiler optimised away.

export const VS = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';

export const mainFS = prec => prec + `
uniform sampler2D uImg; uniform sampler2D uPrev;
uniform vec2 uRes; uniform vec2 uDrift; uniform vec2 uTilt; uniform vec2 uJulia;
uniform vec3 uP0; uniform vec3 uP1; uniform vec3 uP2; uniform vec3 uP3; uniform vec3 uBg; uniform vec3 uPoke;
uniform float uAspect, uT, uMode, uSeg, uZoom, uRot, uWarp, uTwist, uTrail, uHue, uChroma, uBright, uContrast, uSat, uTunZ, uFb, uFbRot;
uniform float uPalMix, uPalPhase, uSlice, uSliceSeed, uHolo, uBands, uSparkle, uBump, uPokeAmp;
uniform sampler2D uEchoTex; uniform float uLattice, uLatScale, uLatWarp, uEcho, uBreath;   // trip layer

float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.0,0.0)), u.x), mix(h21(i+vec2(0.0,1.0)), h21(i+vec2(1.0,1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0; float a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
vec2 mr(vec2 u){ return abs(mod(u + 1.0, 2.0) - 1.0); }   // mirrored repeat, never shows an edge
vec3 hueRot(vec3 c, float a){
  const mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toR = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 y = toY*c; float cs = cos(a); float sn = sin(a);
  y.yz = mat2(cs, -sn, sn, cs)*y.yz; return toR*y; }
// Cyclic 4-stop palette: 0 → P0 … 0.75 → P3 … 1 → back to P0.
vec3 pal(float t){
  t = fract(t)*4.0;
  vec3 c = mix(uP0, uP1, smoothstep(0.0, 1.0, clamp(t, 0.0, 1.0)));
  c = mix(c, uP2, smoothstep(0.0, 1.0, clamp(t-1.0, 0.0, 1.0)));
  c = mix(c, uP3, smoothstep(0.0, 1.0, clamp(t-2.0, 0.0, 1.0)));
  return mix(c, uP0, smoothstep(0.0, 1.0, clamp(t-3.0, 0.0, 1.0))); }
vec3 gradeMap(vec3 c){
  float lm = smoothstep(0.06, 0.82, dot(c, vec3(0.299, 0.587, 0.114)));
  return mix(c, pal(lm*0.74 + uPalPhase), uPalMix); }
// Holo sheet height field: folds + a ripple ("poke") launched on kicks.
float hf(vec2 v, float amp, float t){
  float h = amp*(0.55*sin(v.x*4.0 + t*1.3)*cos(v.y*3.0 - t*0.9) + 0.3*sin(v.y*6.5 + v.x*2.0 - t*1.7) + 0.6*(fbm(v*1.8 + vec2(t*0.25, -t*0.2)) - 0.5));
  float d = length(v - uPoke.xy);
  float front = 1.0 - smoothstep(uPoke.z*0.6 - 0.02, uPoke.z*0.6 + 0.1, d);
  return h + uPokeAmp*0.09*sin(d*24.0 - uPoke.z*13.0)*exp(-uPoke.z*1.6)*front; }
// Hexagonal lattice (Klüver's honeycomb form constant): local coords in xy, cell id in zw.
const vec2 HS = vec2(1.0, 1.7320508);
float hexDist(vec2 p){ p = abs(p); return max(dot(p, HS*0.5), p.x); }
vec4 hexCell(vec2 p){
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0))/HS.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy*HS, p - (hc.zw + 0.5)*HS);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5); }

void main(){
  vec2 fc = gl_FragCoord.xy;
  // glitch slices: some horizontal bands shift sideways on snares
  float by = floor(fc.y/uRes.y*20.0);
  float sl = (h21(vec2(by, uSliceSeed)) - 0.5)*uSlice*step(0.55, h21(vec2(by*1.7, uSliceSeed + 3.1)));
  vec2 p0 = (fc - 0.5*uRes)/uRes.y;
  p0.x += sl*0.35;
  vec2 p = p0/uZoom;
  // breathing: slow radial swelling plus an organic bulge, independent of the beat
  p *= 1.0 + uBreath*(0.05*sin(length(p)*7.0 - uT*1.3) + 0.06*(fbm(p*1.3 + uT*0.08) - 0.5));
  if(uMode < 0.5) p.x = abs(p.x);          // Mirror: fold first so the symmetry stays on screen
  p = rot(uRot)*p;
  vec3 col; float fog = 1.0;

  if(uMode > 3.5 && uMode < 4.5){
    // ---- Holo: the image printed on a rippling iridescent foil sheet ----
    vec2 pp = p/(1.0 + dot(p, uTilt));     // perspective tilt
    float amp = 0.05 + 0.6*uWarp;
    float e = 0.004;
    float h0 = hf(pp, amp, uT);
    float hx = hf(pp + vec2(e, 0.0), amp, uT);
    float hy = hf(pp + vec2(0.0, e), amp, uT);
    vec3 n = normalize(vec3(-(hx-h0)/e, -(hy-h0)/e, 1.0));
    vec2 sp = pp + n.xy*0.06 - vec2(0.0, h0*0.25);
    float ca = uRes.x/uRes.y;
    float sh = min(0.78, 0.78*ca/uAspect);
    vec2 iuv = vec2(sp.x/(sh*uAspect), sp.y/sh) + 0.5;
    vec2 ed = min(iuv, 1.0 - iuv);
    float inside = smoothstep(0.0, 0.004, ed.x)*smoothstep(0.0, 0.004, ed.y);
    vec2 bq = rot(0.6)*iuv*3.0;             // fine anisotropic scratches
    float b1 = vnoise(vec2(bq.x*70.0, bq.y*5.0));
    float b2 = vnoise(vec2(bq.x*5.0 + 3.0, bq.y*70.0));
    n = normalize(n + vec3(b1 - 0.5, b2 - 0.5, 0.0)*uBump*0.5 + vec3(uTilt*0.8, 0.0));
    vec3 img = texture2D(uImg, clamp(iuv, 0.0, 1.0)).rgb;
    vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
    float ndv = max(n.z, 0.0);
    float film = ((1.0 - ndv)*10.0 + h0*5.0 + dot(n.xy, vec2(0.7, 0.4))*3.0 + dot(iuv, vec2(0.9, 1.3))*1.2)*uBands + uT*0.05 + uPalPhase;
    vec3 rainbow = 0.5 + 0.5*cos(6.2831853*(film + vec3(0.0, 0.33, 0.67)));
    vec3 irid = mix(rainbow, pal(film*0.5), uPalMix);
    float diff = 0.5 + 0.7*max(dot(n, L), 0.0);
    vec3 R = reflect(-L, n);
    float spec = pow(max(R.z, 0.0), 24.0);
    float lum = dot(img, vec3(0.333));
    vec3 c = mix(img, img*0.3 + irid*(0.35 + 0.9*lum), uHolo)*diff;
    c += spec*0.7*uBright*mix(vec3(1.0), irid, 0.5);
    vec2 cell = floor(iuv*vec2(200.0*uAspect, 200.0));
    float rr = h21(cell + floor(uT*9.0)*vec2(0.37, 0.71));
    float glint = smoothstep(1.0 - 0.014*uSparkle, 1.0, rr)*(0.5 + 1.5*spec + 0.8*(1.0 - ndv));
    c += glint*mix(vec3(1.0), irid, 0.4)*3.0*uSparkle;
    col = mix(uBg, c, inside);

  } else if(uMode > 4.5 && uMode < 5.5){
    // ---- Fractal: Julia set; the first orbit point that lands in the image box samples it ----
    vec2 z = vec2(-p.y, p.x)*2.0;          // rotated so the set runs along the tall axis
    float trapI = -1.0; vec2 tz = vec2(0.0); float sm = 32.0;
    for(int i=0;i<32;i++){
      z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + uJulia;
      float m2 = dot(z, z);
      if(trapI < 0.0 && i > 0 && abs(z.x) < 0.42*uAspect && abs(z.y) < 0.42){ trapI = float(i); tz = z; }
      if(m2 > 64.0){ sm = float(i) - log2(max(log2(m2), 1.0)) + 4.0; break; }
    }
    vec2 tuv = vec2(tz.x/(0.84*uAspect), tz.y/0.84) + 0.5 + uDrift*0.3;
    vec3 img = texture2D(uImg, mr(tuv)).rgb;
    vec3 esc = texture2D(uImg, mr(vec2(sm*0.04 + uT*0.02, 0.5 + 0.3*sin(sm*0.3)) + uDrift)).rgb*(0.38 + 0.22*sin(sm*0.5 + uT));
    float depth = 1.0 - clamp(trapI/32.0, 0.0, 1.0)*0.75;
    col = trapI < 0.0 ? esc : img*depth;
    col = gradeMap(col);

  } else {
    // ---- coordinate modes: Mirror, Kaleido, Tunnel, Liquid, Infinite ----
    vec2 q;
    if(uMode > 0.5 && uMode < 1.5){        // Kaleido: fold before the warp so symmetry holds
      float r = length(p); float a = atan(p.y, p.x);
      float seg = 6.2831853/uSeg;
      a = mod(a, seg); a = abs(a - 0.5*seg);
      a += uTwist*r;
      p = r*vec2(cos(a), sin(a));
    }
    vec2 w = vec2(fbm(p*2.3 + vec2(0.0, uT*0.21)), fbm(p*2.3 + vec2(5.2, -uT*0.17))) - 0.5;
    p += w*uWarp;
    if(uMode < 1.5){
      q = p;
    } else if(uMode < 2.5){                // Tunnel
      float r = max(length(p), 0.0001); float a = atan(p.y, p.x);
      float u = abs(a)/3.14159265*uSeg*0.25;
      q = vec2(u*0.8 + uTwist*r*0.3, 0.3/r + uTunZ);
      fog = smoothstep(0.0, 0.2, r);
    } else if(uMode < 3.5){                // Liquid
      vec2 w2 = vec2(fbm(p*1.6 + w*2.5 + uT*0.07), fbm(p*1.6 - w*2.5 - uT*0.05 + 3.1)) - 0.5;
      q = p + w2*uWarp*1.4;
    } else {                               // Infinite: log-polar zoom, mirrored per octave, with folds and spiral
      float r = max(length(p), 0.0001); float lr = log(r); float a = atan(p.y, p.x);
      float seg = 6.2831853/uSeg;
      a = mod(a + lr*uTwist*0.35, seg); a = abs(a - 0.5*seg);
      float per = 0.85;
      float m = mod(lr - uTunZ*0.45, 2.0*per); m = per - abs(m - per);
      q = vec2(cos(a), sin(a))*exp(m)*0.24;
      fog = smoothstep(0.0, 0.025, r);
    }
    q += uDrift;
    vec2 uv = vec2(q.x/uAspect, q.y) + 0.5;
    vec2 dir = normalize(p0 + 0.00001)*uChroma*0.006;
    col.r = texture2D(uImg, mr(uv + dir)).r;
    col.g = texture2D(uImg, mr(uv)).g;
    col.b = texture2D(uImg, mr(uv - dir)).b;
    col = gradeMap(col);
  }

  col = hueRot(col, uHue);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5)*uContrast + 0.5;
  col = clamp(col*uBright*fog, 0.0, 1.0);
  // trip layer 1 — geometry (Klüver's form constants). A honeycomb either flat on the view, or mapped
  // through the eye-to-cortex log-polar transform (uLatWarp → 1), which turns it into a funnel-shaped web
  // that flows toward the centre — the way Bressloff & Cowan's model explains tunnels and cobwebs.
  if(uLattice > 0.001){
    vec2 wob = (vec2(fbm(p0*3.0 + uT*0.1), fbm(p0*3.0 - uT*0.1 + 4.0)) - 0.5)*(0.6 + uWarp*2.0);
    vec4 hf1 = hexCell(rot(uRot*0.3)*p0*uLatScale + wob);
    float r0 = max(length(p0), 0.001);
    float nAround = floor(uLatScale*0.6 + 0.5);
    vec2 lpp = vec2(atan(p0.y, p0.x), log(r0) - uTunZ*0.25)*nAround/6.2831853;
    vec4 hf2 = hexCell(lpp + wob*0.15);
    float l1 = 1.0 - smoothstep(0.0, 0.07, 0.5 - hexDist(hf1.xy));
    float l2 = (1.0 - smoothstep(0.0, 0.07, 0.5 - hexDist(hf2.xy)))*smoothstep(0.02, 0.12, r0);
    float line = mix(l1, l2, uLatWarp);
    float cid = h21(mix(hf1.zw, hf2.zw, step(0.5, uLatWarp)));
    line *= 0.65 + 0.35*sin(uT*1.7 + cid*6.2831853);       // lines shimmer cell by cell
    vec3 lc = mix(pal(cid*0.5 + uPalPhase + 0.25), vec3(1.0), 0.2);
    col *= mix(1.0, 0.8 + 0.4*cid, uLattice*0.6);           // each cell slightly different: texture repetition
    col = min(col + lc*line*uLattice*1.1, 1.2);
  }
  // trip layer 2 — tracers: a held copy of an earlier frame, refreshed in steps on the beat grid
  if(uEcho > 0.001) col = mix(col, texture2D(uEchoTex, fc/uRes).rgb, uEcho*0.45);
  // feedback: previous frame, slightly zoomed and rotated, mixed in as trails
  vec2 s = fc/uRes - 0.5;
  float ar = uRes.x/uRes.y;
  s.x *= ar; s = rot(uFbRot)*s/uFb; s.x /= ar;
  vec3 prev = texture2D(uPrev, s + 0.5).rgb;
  col = mix(col, prev, uTrail);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const postFS = prec => prec + `
uniform sampler2D uTex; uniform vec2 uRes; uniform float uT, uGrain, uVig, uGlow;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec3 hot(vec2 uv){ return max(texture2D(uTex, uv).rgb - 0.62, 0.0); }
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec3 c = texture2D(uTex, uv).rgb;
  if(uGlow > 0.001){                       // stochastic 8-tap glow on the bright parts
    vec2 px = 1.0/uRes;
    float r = uRes.y*0.014;
    float a = h21(gl_FragCoord.xy)*6.2831853;
    vec3 g = vec3(0.0);
    for(int i=0;i<8;i++){
      float fi = float(i);
      float ang = a + fi*0.7853982;
      float rad = r*(1.0 + mod(fi, 2.0)*1.4);
      g += hot(uv + vec2(cos(ang), sin(ang))*rad*px);
    }
    c += g*uGlow*0.42;
  }
  vec3 over = max(c - 0.78, 0.0);          // soft highlight roll-off instead of clipping
  c = min(c, 0.78) + 0.22*(1.0 - exp(-over/0.22));
  vec2 d = uv - 0.5; d.x *= uRes.x/uRes.y;
  c *= mix(1.0, 1.0 - smoothstep(0.28, 0.9, length(d)), uVig);
  vec2 gp = gl_FragCoord.xy + fract(uT*7.13)*vec2(317.0, 191.0);
  float gm = h21(gp) - 0.5;
  vec3 gc = vec3(h21(gp + 1.3), h21(gp + 2.9), h21(gp + 5.1)) - 0.5;
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  float amt = uGrain*(0.14 + 0.2*(1.0 - abs(lum*2.0 - 1.0)));   // grain strongest in midtones
  c += (gm*0.75 + gc*0.35)*amt;
  gl_FragColor = vec4(c, 1.0);
}
`;

// Copies a texture: used to capture the tracer frame.
export const copyFS = prec => prec + `
uniform sampler2D uTex; uniform vec2 uRes;
void main(){ gl_FragColor = texture2D(uTex, gl_FragCoord.xy/uRes); }
`;
