# CLAUDE.md — Miroir Sonore

Audio-reactive visual tool: the user drops a picture (an image or a video) and a sound. A WebGL shader folds, warps and hits the picture with the music. The user records vertical clips (TikTok/Reels) with the audio baked in, saves still images, and keeps looks as presets. It is used mostly on a phone. It is plain browser JavaScript (ES modules) with no framework, and esbuild bundles it into one HTML file.

## Commands

```bash
npm install                 # esbuild + optional test deps (gl, jsdom, pngjs)
npm run dev                 # serve the unbundled source at http://localhost:5173
npm run build               # → dist/index.html (standalone page) + dist/artifact.html (claude.ai Artifact fragment)
npm run test:shaders        # compile shaders headlessly, render every mode → tests/out/modes.png
npm run test:sim            # run dist/index.html in jsdom with a fake 120 BPM track; asserts behaviour
npm test                    # build + both tests
```
On Linux the tests need a virtual display: `xvfb-run -a npm test`. macOS and Windows run them directly.

Run `npm test` after any change to `src/gl`, `src/audio`, `src/auto.js`, `src/map.js` or `src/record.js`. Open `tests/out/modes.png` after shader changes. It is a grid of every mode × three directions, and the quickest way to see a visual regression.

## Architecture

Frame order (in `src/main.js`): clock → the clip loop → `analyse` → `syncVideo` → `autoTick` → `handTick` → `step` → `render` → `updateHUD` → `drawSongBar` → `recordTick` → `adaptQuality`. While a clip is rendered frame by frame (`G.exact`) the loop stands still and `exactFrame(t, dt, ms, auto)` in `main.js` is called for each frame instead.

| File | Responsibility |
|---|---|
| `src/config.js` | Modes, color directions, fader definitions, defaults, export options. Start here for new modes/directions. |
| `src/state.js` | Shared mutable state objects (see "State" below). Mutate fields; never reassign the exports. |
| `src/gl/shaders.js` | GLSL ES 1.0. `mainFS` (mode transforms, palette grading, trip layer, feedback trails), `postFS` (tape, glow, roll-off, vignette, grain), `copyFS` (tracer capture). |
| `src/gl/renderer.js` | WebGL1 setup, ping-pong feedback targets (half-float when available), the held tracer frame, mipmapped image texture or a video's current frame (`useVideo`), the one-row Wave data texture, uniform upload. |
| `src/audio/engine.js` | `<audio>` → analyser graph. `analyse` gets each frame's envelopes and hits from the score when the song has been read ahead, else from the detectors listening live. `analyseAt(t, dt)` reads the score at a chosen time. Fires `on.kick/snare/hat/drop`. |
| `src/audio/detect.js` | The detectors and their memory (`makeDetectors`): band envelopes, spectral-flux onsets (kick/snare/hat), tempo from kick intervals, drop detection. They read anything that answers like an AnalyserNode. |
| `src/audio/score.js` | The song read ahead: `decodeTrack`, `makeReader` (an FFT that answers like the browser's analyser), `scanTrack` (the detectors over the whole track, 60 steps a second → the score), `followScore`, `snapBar`, `bestStart`. |
| `src/songbar.js` | The song bar: waveform, playhead, and the clip window (tap to start it there, drag to move it, snapped to bars). |
| `src/audio/sample-loop.js` | Offline-synthesised 16 s demo loop (groove → breakdown → drop) encoded to WAV. |
| `src/image/palette.js` | k-means palette from the loaded image → the "Picture" direction. |
| `src/image/sample-image.js` | Generated demo image. |
| `src/map.js` | Sound → uniforms. Hit reactions (`reactKick`, `reactSnare`) and the per-frame `step`. |
| `src/hands.js` | The hands: drags on the picture and held arrow keys push offsets (`HAND`) on top of the look; spring back, or Latch. |
| `src/auto.js` | Looks, directions, trips (`setTrip`), Shuffle, the Auto engine (new look on a kick every N bars and on drops), Morph/Cut transitions. |
| `src/ui.js` | Builds controls from config, `syncUI`, phone tabs, full screen (CSS immersive + optional Fullscreen API), results list, keyboard. |
| `src/record.js` | Sessions (1/3/5 clips) in two ways: exact (a take, then frame by frame) and live (MediaRecorder, the fallback). Still images (`takeStill`). Saving (Artifact downloads capability, else share sheet, else download link). |
| `src/take.js` | A take: `snapshot`/`restore` of everything a pass starts from, `takeTick` writes what changed with its time, `playTake` plays it back. |
| `src/exact.js` | `exactSupport` (which codecs this browser can write), `clipSound` (the clip's stretch of the song), `writeClip` (frames → MP4 through Mediabunny). |
| `src/rng.js` | Seeded chance in two streams, `RNG.looks` and `RNG.hits` (`createRng` comes from ifah-visual-lab). Use these, never `Math.random`, for anything that shows in the picture. |
| `src/presets.js` | Kept looks: `keepLook` snapshots everything the controls say plus a thumbnail, `applyKept` brings one back (values checked against today's ranges). Stored in `localStorage`, 12 at most. |
| `src/view.js` | Output size from format/quality; adaptive preview scale (1 → .75 → .5 on slow devices, forced to 1 while recording). |
| `index.html` | Markup template with `build:*` markers that `scripts/build.mjs` replaces. |
| `src/styles.css` | All styles. Phone (`max-width:880px`), mid, wide (`min-width:1180px`) and full screen (`body.immersive`) layouts, light (paper) and dark themes from one token set. |

### Look and feel
The interface follows IFAH's paper direction. Colour is semantic: ink is what is read and the main act (Record, Play), blue is what the hand sets (faders, pressed choices, the waiting Keep frame), rust is time and now (playhead, hit lights, recording, the hold-to-remove bar). Type has four roles: Archivo wide for the name and numbers, Archivo for rows, Newsreader for the user's own material (file names), IBM Plex Mono caps for labels. Corners are 2px, frames are hairlines, sections are printed with a rule in ink and a label. Every colour is a token on `:root`; the dark blocks only redefine tokens. On a phone the three acts (Image · Record · Keep) are fixed at the bottom and touch targets are 40px or more.

### State
- `P`: what the controls say. `V`: live values that ease toward `P` (time constant `G.easeTau`; Auto raises it so changes glide). Shaders read `V` for continuous params and `P` for discrete ones (`mode`, `seg`).
- `S`: accumulators (time, rotation, drift, tunnel depth, Julia angle, palette phase, `morph`).
- `A`: analysis output. Envelopes `low/mid/high/lvl` (0–1) plus hit impulses `kick/snare/hat/drop/cut` that jump to 1 and decay.
- `U`: uniforms computed each frame by `map.js`.
- `G`: scalars (clock, direction, palette, output size, preview scale).

### Rules that matter
- **Beat, Pump and Flow are the user's.** `V.beat` scales hit effects (glitch, color split, ripples, jolts, drop flash). `V.pump` and `PUMP.style`/`PUMP.len` control the kick "sidechaining" the picture: Off, Duck, Punch or Breathe, with a length in notes synced to the detected tempo. `V.flow` scales continuous audio motion. Auto and Shuffle must never change any of them.
- **Pump is the only path from kick/bass to zoom, brightness, contrast and glow** (`pumpShape` in `map.js`). Don't add kick or bass terms to those uniforms elsewhere, or Pump Off stops meaning "no pumping". Moving a Look fader (punch, glitch, warp, trails, spin, zoom, folds, mode) turns Auto off. Color/texture faders and macros do not.
- **A kept look is the user's whole setup**, so bringing one back does set Beat, Pump, Flow, pump style and Auto. That is the one exception to the rule above.
- **The hands never write to `P`.** `HAND.v` (spin, zoom, warp, trails, each −1 to 1) is added to the look inside `map.js/step` only. So playing the picture leaves Auto on, and a kept look does not hold the hands. One finger or the mouse: sideways spin, up/down zoom. Two fingers: trails and warp. Keys: arrows, Shift + arrows, `0` centre, `L` latch.
- **Finding the modes.** On a computer the nine modes are also shown beside the picture (`#miniModes`, under Auto / Shuffle / Latch); on a phone they are the first thing in the Look tab. `MARKED_MODES` in `config.js` draws a mode in red in both pickers (Wave, at the owner's request).
- **Wave and VHS are chosen by hand.** No direction or trip lists them, so Auto and Shuffle never pick them and Auto's tuned pools stay as they were. Choosing one sets its starting look (`HAND_MODES` in `config.js`).
- **VHS (mode 8)** plays the picture upright; the tape itself is in `postFS` (`uTape`, `uTapeHit`), so the Tape fader can lay it over any mode. In VHS mode the tape is at least 85%.
- **Wave (mode 7)** is the song's own waveform, bar by bar, passing like a train from left to right and cut out of the picture (the owner's reference: the waveform of a track on SoundCloud). `engine.js` measures the level as the RMS of the time-domain signal (`A.wave`); `map.js` keeps the train in `WV.hist` (index 0 is the bar being born at the left edge, which follows the sound until it leaves) and uploads it as the green channel of `WV.tex` (256 × 1). In this mode three faders are renamed for what they do: Folds reads Bars (8 bars a step), Warp reads Height, Spin reads Speed (at the default one bar of music fills the screen). Behind (Wave only) lets the picture show around the bars.
- **A second picture** (Sources) is laid over the first in every mode: `uImg2` is sampled with the same coordinates as the first picture and combined by `over()` in `mainFS` (Mix, Screen or Multiply, by Amount). Wave is the exception: there the bars are the first picture and the second one is the ground behind them, as bright as Behind says (loading a second picture raises Behind so it shows). It is an image, not a video, and a dropped file still replaces the first picture.
- **Full screen stays clear while the keys are played.** The hand marks are hidden there and no key wakes the controls (only the pointer, or Tab); the owner treats full screen as the recording itself.
- **A video picture** plays muted and follows the sound's clock (`syncVideo` in `main.js`), so one section of the track always shows the same frames. A video dropped on the page is both picture and sound.
- **Mode ids are fixed**: 0 Mirror, 1 Kaleido, 2 Tunnel, 3 Liquid, 4 Holo, 5 Fractal, 6 Infinite, 7 Wave, 8 VHS. They are referenced in `config.js` (`DIRS[*].modes`, `TRIPS[*].modes`, `FOLD_MODES`, `HOLO`, `WAVE`, `VHS`, `HAND_MODES`), `shaders.js` (`uMode` branches) and `auto.js` (per-mode tweaks).
- **WebGL1 / GLSL ES 1.0 only** (older iPhones). Loops need constant bounds. `smoothstep(a, b, x)` needs `a < b`. Avoid `texture2D` inside non-uniform control flow: compute the coordinate in the loop and sample after it (see the Fractal branch).
- Kaleido and Mirror fold **before** the warp; otherwise the symmetry breaks.
- **Audio graph**: `createMediaElementSource` can be called once per element, so swap `audio.src` instead of making new elements. Create or resume the AudioContext only inside a user gesture (`ensureCtx`). `navigator.audioSession.type = 'playback'` lets iOS play with the silent switch on.
- **The song is read ahead when it can be.** `SONG.score` holds what the detectors found over the whole track; while it exists nothing listens live. Do not add analysis that only works live: put it in `detect.js`, so the scan gets it too. The detectors' thresholds are part of how the picture feels and are the owner's to tune.
- **The clip** (`CLIP.start`, `CLIP.len`) is what plays in a loop and what gets recorded. Its length is the Export length; `bestStart` and the song bar move its start.
- **Exact clips.** When `exactReady()` (a score, a decoded buffer, an encoder, a still picture) Record makes the clip frame by frame at the full output size, 30 frames a second. Perform: a take is played once and written down, then rendered. Instant: rendered straight away with Auto running inside the render. A take holds outcomes (the looks that were applied and how they landed, the hands' targets), so the first clip shows what the player saw; variations replay only the hands and get looks of their own. The render calls `exactFrame` only: anything a frame needs must be reachable from `analyseAt`, `autoTick`, `handTick`, `step` and `render`, and must not read the page's clocks.
- **Live recording** (the fallback: a video as the picture, a song that cannot be read, no encoder) captures the canvas (`captureStream(30)`) plus the analyser's `MediaStreamDestination`. Call `setOutputScale(1)` before creating the stream. MP4 is preferred and WebM is the fallback.
- **Fluid** (Color) keeps a share of the old frame and lets it drift along slow currents in the feedback step of `mainFS` (`uFluid`, `uFlowT`): the way the Windows Media Player and MilkDrop visualisations moved, where each frame is the last one carried a little further.
- **The build targets ES2020** (Mediabunny needs BigInt), so iOS 14 and later; the bundle is minified. Mediabunny is MPL-2.0: the notice in the built page and in the README must stay.

### Trips (`TRIPS` in config.js)
Six substance-named art presets (LSD, Psilocybin, DMT, Mescaline, Ayahuasca, Ketamine), built from how the visuals are described in research and trip reports. Each trip sets a palette, the modes Auto may use, a look, a pump style and the **trip layer**:
- **Geometry** (`lattice`, `latScale`, `latWarp`): Klüver's honeycomb form constant. At `latWarp` 0 it lies flat on the view. At 1 it goes through the eye-to-cortex log-polar map (Bressloff & Cowan 2001), so it becomes a funnel/cobweb lattice flowing toward the centre. The angular cell count is rounded to an integer so the `atan` seam is invisible.
- **Tracers** (`echo`, `G.echoRate`): a held copy of the output is refreshed in steps (1/16, 1/8 or 1/4 note, and on every kick) and mixed back in. This gives stuttering afterimages, which are different from the smooth feedback trails. The held frame lives in the renderer's `echo` target.
- **Breathing** (`breath`): slow radial swelling plus an organic bulge applied to the coordinates. It doesn't follow the beat.
- **Journey** (`G.journey`): the trip layer's intensity `G.arc` builds over the first quarter of each recorded clip, peaks, then eases. While previewing it follows a slow 32 s wave.

Each trip is also registered as a hidden entry in `DIRS`, so its palette and modes flow through the normal direction code; hidden entries don't get Direction chips. Picking a Direction while a trip is on recolors it and keeps the trip layer. Trip "None" turns the layer off.

### Where it is live
- Public: https://miroir-sonore.pages.dev (Cloudflare Pages, direct upload, project `miroir-sonore`, production branch `main`). A push to GitHub does not deploy; the site changes only when someone runs `wrangler pages deploy dist --project-name miroir-sonore --branch main --commit-hash <sha>` from a clean tree after `npm test`. Deploy on the owner's word.
- `dist/artifact.html` goes up with it and is reachable at `/artifact`; it is the same page as a fragment and holds nothing private.

### Publishing as a claude.ai Artifact
`dist/artifact.html` is a fragment: no `<html>/<head>/<body>`, because the Artifact host adds its own skeleton. Inside an Artifact:
- Only Google Fonts may load from outside. Scripts can come only from the CDN allowlist, so keep everything bundled.
- Downloads must go through `window.claude.use('downloads')`. `record.js/saveBlob` already does this. Declare the `downloads` capability when publishing (`capabilities: {downloads: true}`).
- Kept looks use `localStorage`, which belongs to one browser: a phone and a computer each have their own row.
- `alert/confirm/prompt` do nothing. The Fullscreen API may be refused, which is why the CSS immersive layout exists.

### Recipes
- **New mode**: add the name to `MODES` (its index is the id). Add a `uMode` branch in `mainFS` (coordinate modes go in the last `else`; modes that compute color directly get their own branch, like Holo and Fractal). Add it to some `DIRS[*].modes`, plus `FOLD_MODES` if it uses folds and any per-mode tweak in `auto.js/lookFor`. Then run `npm test` and check `tests/out/modes.png`.
- **New trip**: add an entry to `TRIPS` (palette, modes, `fx`, `look`, `tex`, `pump`, `echoRate`, `desc`). The chip, hidden direction and keyboard cycling are automatic. Check it with the trip row of `npm run test:shaders` and the trip loop in `test:sim`.
- **New direction**: add an entry to `DIRS` with 4 palette colors (dark → light), `mix`, the `modes` it favours, and grain/glow/color defaults. Chips are generated automatically.
- **New fader**: add a definition to `FEEL`/`TEX`/`FOIL`/`MACROS`, a default in `DEFAULTS`, and the key in `KEYS` if it should ease. Read it in `map.js` or `renderer.js`.

## What comes next (agreed with the owner, 7 Oct 2026, in this order)
Done: reading the song ahead with a clip on a waveform (1), frame-exact export (2), takes (3, first form: one take per session, rendered at once), and the Fluid control from the Windows Media Player study.
1. Takes kept and replayed: several takes of the same clip, choose one, render it again in another format.
2. Hear like a musician: the song split into drums, bass, voice and the rest in the browser (Demucs ports), each driving its own part of the picture; a learned beat and downbeat tracker (Beat This!, MIT). Both are large downloads: optional, computer first. Avoid Essentia.js (AGPL).
3. Words: a hook or lyric layer that hits with the beat, inside the TikTok safe zone.
4. Depth from one picture: a depth map for a 2.5D picture the music can push.
5. Formats for musicians: a seamless 3 to 8 second vertical loop for Spotify Canvas.
6. More ways to play it: a MIDI controller on the hands and faders (`initMidi` in IFAH's `src/engine/midi.js` is a start), camera hand tracking driving the same four hand values (IFAH's hands engine; its 17 MB of model cannot live in the single file).
Also still open: a video as the picture in exact clips (it is recorded live for now), microphone or line input, GLB models.
