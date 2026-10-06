# CLAUDE.md — Miroir Sonore

Audio-reactive visual tool: the user drops an image and a sound. A WebGL shader folds, warps and hits the image with the music. The user records vertical clips (TikTok/Reels) with the audio baked in. It is plain browser JavaScript (ES modules) with no framework, and esbuild bundles it into one HTML file.

## Commands

```bash
npm install                 # esbuild + optional test deps (gl, jsdom, pngjs)
npm run dev                 # serve the unbundled source at http://localhost:5173
npm run build               # → dist/index.html (standalone page) + dist/artifact.html (claude.ai Artifact fragment)
npm run test:shaders        # compile shaders headlessly, render every mode → tests/out/modes.png
npm run test:sim            # run dist/index.html in jsdom with a fake 120 BPM track; asserts behaviour
npm test                    # build + both tests
```
On Linux the tests need a virtual display: `xvfb-run -a npm test`. macOS runs them directly.

Run `npm test` after any change to `src/gl`, `src/audio`, `src/auto.js`, `src/map.js` or `src/record.js`. Open `tests/out/modes.png` after shader changes. It is a grid of every mode × three directions, and the quickest way to see a visual regression.

## Architecture

Frame order (in `src/main.js`): clock → `analyse` → `autoTick` → `step` → `render` → `updateHUD` → `recordTick` → `adaptQuality`.

| File | Responsibility |
|---|---|
| `src/config.js` | Modes, color directions, fader definitions, defaults, export options. Start here for new modes/directions. |
| `src/state.js` | Shared mutable state objects (see "State" below). Mutate fields; never reassign the exports. |
| `src/gl/shaders.js` | GLSL ES 1.0. `mainFS` (mode transforms, palette grading, feedback trails) and `postFS` (glow, roll-off, vignette, grain). |
| `src/gl/renderer.js` | WebGL1 setup, ping-pong feedback targets (half-float when available), mipmapped image texture, uniform upload. |
| `src/audio/engine.js` | `<audio>` → analyser graph, band envelopes, spectral-flux onsets (kick/snare/hat), tempo from kick intervals, drop detection. Fires `on.kick/snare/hat/drop`. |
| `src/audio/sample-loop.js` | Offline-synthesised 16 s demo loop (groove → breakdown → drop) encoded to WAV. |
| `src/image/palette.js` | k-means palette from the loaded image → the "Picture" direction. |
| `src/image/sample-image.js` | Generated demo image. |
| `src/map.js` | Sound → uniforms. Hit reactions (`reactKick`, `reactSnare`) and the per-frame `step`. |
| `src/auto.js` | Looks, directions, Shuffle, the Auto engine (new look on a kick every N bars and on drops), Morph/Cut transitions. |
| `src/ui.js` | Builds controls from config, `syncUI`, phone tabs, full screen (CSS immersive + optional Fullscreen API), results list, keyboard. |
| `src/record.js` | Recording sessions (1/3/5 clips), MediaRecorder, saving (Artifact downloads capability, else share sheet, else download link). |
| `src/view.js` | Output size from format/quality; adaptive preview scale (1 → .75 → .5 on slow devices, forced to 1 while recording). |
| `index.html` | Markup template with `build:*` markers that `scripts/build.mjs` replaces. |
| `src/styles.css` | All styles. Desktop, phone (`max-width:880px`) and full screen (`body.immersive`) layouts. |

### State
- `P`: what the controls say. `V`: live values that ease toward `P` (time constant `G.easeTau`; Auto raises it so changes glide). Shaders read `V` for continuous params and `P` for discrete ones (`mode`, `seg`).
- `S`: accumulators (time, rotation, drift, tunnel depth, Julia angle, palette phase, `morph`).
- `A`: analysis output. Envelopes `low/mid/high/lvl` (0–1) plus hit impulses `kick/snare/hat/drop/cut` that jump to 1 and decay.
- `U`: uniforms computed each frame by `map.js`.
- `G`: scalars (clock, direction, palette, output size, preview scale).

### Rules that matter
- **Beat and Flow are the user's.** `V.beat` scales every hit effect; `V.flow` scales continuous audio motion. Auto and Shuffle must never change them. Moving a Look fader (punch, glitch, warp, trails, spin, zoom, folds, mode) turns Auto off. Color/texture faders and macros do not.
- **Mode ids are fixed**: 0 Mirror, 1 Kaleido, 2 Tunnel, 3 Liquid, 4 Holo, 5 Fractal, 6 Infinite. They are referenced in `config.js` (`DIRS[*].modes`, `FOLD_MODES`, `HOLO`), `shaders.js` (`uMode` branches) and `auto.js` (per-mode tweaks).
- **WebGL1 / GLSL ES 1.0 only** (older iPhones). Loops need constant bounds. `smoothstep(a, b, x)` needs `a < b`. Avoid `texture2D` inside non-uniform control flow: compute the coordinate in the loop and sample after it (see the Fractal branch).
- Kaleido and Mirror fold **before** the warp; otherwise the symmetry breaks.
- **Audio graph**: `createMediaElementSource` can be called once per element, so swap `audio.src` instead of making new elements. Create or resume the AudioContext only inside a user gesture (`ensureCtx`). `navigator.audioSession.type = 'playback'` lets iOS play with the silent switch on.
- **Recording** captures the canvas (`captureStream(30)`) plus the analyser's `MediaStreamDestination`. Call `setOutputScale(1)` before creating the stream. MP4 is preferred and WebM is the fallback.

### Publishing as a claude.ai Artifact
`dist/artifact.html` is a fragment: no `<html>/<head>/<body>`, because the Artifact host adds its own skeleton. Inside an Artifact:
- Only Google Fonts may load from outside. Scripts can come only from the CDN allowlist, so keep everything bundled.
- Downloads must go through `window.claude.use('downloads')`. `record.js/saveBlob` already does this. Declare the `downloads` capability when publishing.
- `alert/confirm/prompt` do nothing. The Fullscreen API may be refused, which is why the CSS immersive layout exists.

### Recipes
- **New mode**: add the name to `MODES` (its index is the id). Add a `uMode` branch in `mainFS` (coordinate modes go in the last `else`; modes that compute color directly get their own branch, like Holo and Fractal). Add it to some `DIRS[*].modes`, plus `FOLD_MODES` if it uses folds and any per-mode tweak in `auto.js/lookFor`. Then run `npm test` and check `tests/out/modes.png`.
- **New direction**: add an entry to `DIRS` with 4 palette colors (dark → light), `mix`, the `modes` it favours, and grain/glow/color defaults. Chips are generated automatically.
- **New fader**: add a definition to `FEEL`/`TEX`/`FOIL`/`MACROS`, a default in `DEFAULTS`, and the key in `KEYS` if it should ease. Read it in `map.js` or `renderer.js`.

## Ideas not built yet
- Text/caption layer burned into the video (lyrics, hook text).
- Picking a start point by energy (jump to the drop automatically) for each clip in a batch.
- Offline rendering (frame-by-frame with `OfflineAudioContext` analysis) for perfectly smooth exports on slow phones.
- GLB/3D models in the Holo or a new mode.
- Microphone / live input mode.
