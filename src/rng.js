// Seeded chance, so a take can be rendered again with the hits it was played with.
// createRng comes from ifah-visual-lab (src/core/random.js): mulberry32, seeded through xmur3.
function xmur3(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function createRng(seed = 'miroir') {
  const seedFn = xmur3(String(seed));
  let state = seedFn();
  return {
    next() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    fork(label) { return createRng(`${seed}:${label}:${state}`); },
  };
}

// Two streams: looks (which look comes next, how a cut lands) and hits (which way a kick turns the
// picture, where a ripple starts). Kept apart so the number of hits never changes which look is picked.
// Mutate the fields; never reassign the export.
export const RNG = { seed: '', looks: null, hits: null };
export function reseed(seed) {
  RNG.seed = String(seed);
  const r = createRng(RNG.seed);
  RNG.looks = r.fork('looks'); RNG.hits = r.fork('hits');
  return RNG.seed;
}
export const newSeed = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
reseed(newSeed());
