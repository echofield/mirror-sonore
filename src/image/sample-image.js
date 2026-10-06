// A generated abstract image (blobs, ink curves, rings) so the page works before you add your own.
export function makeSampleImage() {
  const w = 1024, h = 1280, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#1a0828'); bg.addColorStop(.5, '#0a1630'); bg.addColorStop(1, '#2a120a');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const pal = ['255,79,163', '255,170,60', '63,215,198', '122,92,255', '255,233,199', '255,96,60'];
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 28; i++) {
    const x = r() * w, y = r() * h, rad = 90 + r() * 360, col = pal[i % pal.length];
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, `rgba(${col},.55)`); rg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = rg; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
  }
  g.globalCompositeOperation = 'source-over';
  g.lineCap = 'round';
  for (let j = 0; j < 70; j++) {
    let px = r() * w, py = r() * h;
    g.beginPath(); g.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      const c1x = px + (r() - .5) * 500, c1y = py + (r() - .5) * 500, c2x = px + (r() - .5) * 500, c2y = py + (r() - .5) * 500;
      px += (r() - .5) * 400; py += (r() - .5) * 400;
      g.bezierCurveTo(c1x, c1y, c2x, c2y, px, py);
    }
    g.strokeStyle = r() < .45 ? `rgba(8,5,14,${.5 + r() * .4})` : `rgba(${pal[Math.floor(r() * pal.length)]},${.5 + r() * .5})`;
    g.lineWidth = 1.5 + r() * 12; g.stroke();
  }
  for (let m = 0; m < 50; m++) {
    g.beginPath(); g.arc(r() * w, r() * h, 4 + r() * 40, 0, Math.PI * 2);
    g.strokeStyle = `rgba(255,240,220,${.3 + r() * .5})`; g.lineWidth = 1 + r() * 4; g.stroke();
  }
  return c;
}
