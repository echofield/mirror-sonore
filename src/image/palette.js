// Builds the "Picture" direction: a 4-color palette (dark → light) taken from the image itself,
// so color cycling stays inside the picture's own color family.
const lum = c => .299 * c[0] + .587 * c[1] + .114 * c[2];
const sat = c => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
const toHex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

export function extractPalette(src) {
  const N = 48, c = document.createElement('canvas'); c.width = c.height = N;
  let data;
  try {
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, N, N);
    data = g.getImageData(0, 0, N, N).data;
  } catch (e) { return null; }
  const px = [];
  for (let i = 0; i + 3 < data.length; i += 4) px.push([data[i] / 255, data[i + 1] / 255, data[i + 2] / 255]);
  if (px.length < 16 || px.some(p => p.some(v => !isFinite(v)))) return null;

  // k-means, k = 6, seeded at luminance quantiles so results are stable for the same image
  px.sort((a, b) => lum(a) - lum(b));
  const K = 6;
  let centers = Array.from({ length: K }, (_, k) => px[Math.floor((k + .5) / K * px.length)].slice());
  let counts = new Array(K).fill(0);
  for (let it = 0; it < 10; it++) {
    const sum = Array.from({ length: K }, () => [0, 0, 0]); counts = new Array(K).fill(0);
    for (const p of px) {
      let best = 0, bd = 1e9;
      for (let k = 0; k < K; k++) {
        const c0 = centers[k], d = (p[0] - c0[0]) ** 2 + (p[1] - c0[1]) ** 2 + (p[2] - c0[2]) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2] += p[2]; counts[best]++;
    }
    centers = centers.map((c0, k) => counts[k] ? sum[k].map(v => v / counts[k]) : c0);
  }
  let cl = centers.map((c0, k) => ({ c: c0, n: counts[k] })).filter(x => x.n > 0).sort((a, b) => lum(a.c) - lum(b.c));
  while (cl.length < 4) cl.push({ c: cl[cl.length - 1].c.map(v => Math.min(1, v * 1.4 + .1)), n: 1 });

  let dark = cl[0].c.slice(), light = cl[cl.length - 1].c.slice();
  const mids = cl.slice(1, -1).sort((a, b) => b.n * (.4 + sat(b.c)) - a.n * (.4 + sat(a.c))).slice(0, 2).map(x => x.c.slice());
  mids.sort((a, b) => lum(a) - lum(b));
  // give the gradient map some depth: a properly dark bottom and a bright top
  const dl = lum(dark); if (dl > .1) dark = dark.map(v => v * .1 / dl);
  const ll = lum(light); if (ll < .78) { const t = (.78 - ll) / (1 - ll); light = light.map(v => v + (1 - v) * t); }
  const rgb = [dark, mids[0], mids[1], light];
  return { rgb, css: `linear-gradient(135deg, ${toHex(mids[0])}, ${toHex(mids[1])} 55%, ${toHex(light)})` };
}
