# Miroir Sonore

Drop an image and a sound. The picture folds, warps and hits with the music. Record vertical clips for TikTok, Reels or Shorts with the audio baked in.

- **Modes:** Mirror, Kaleido, Tunnel, Liquid, Holo (iridescent foil), Fractal (Julia set), Infinite (endless zoom).
- **Directions:** Picture (colors taken from your image), Original (untouched), Neon, Holo, Gold, Ink, Dream, Ember.
- **Auto:** changes the look on a kick every 4, 8 or 16 bars, and on every drop, with a Morph dissolve or a hard Cut.
- **Beat and Flow:** your two live intensity controls. Beat sets the strength of the hits (kick, snare, drop); Flow sets the continuous motion.
- **Export:** 9:16, 1:1 or 4:5, in 720p or 1080p, at 15s, 30s, 60s or full track. Record 1, 3 or 5 variations of the same section in one go.
- Phone layout keeps the preview pinned while you edit. Full screen has floating controls.

Keys: Space play · R record · S shuffle · A auto · F full screen · 1–7 modes.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (unbundled source)
npm run build      # dist/index.html: one self-contained file
```

## Deploy

The build is a single static file, so any static host works.

- **Vercel:** `npx vercel` in this folder; `vercel.json` already sets the build. Or import the repo in the Vercel dashboard.
- **Anywhere else:** upload `dist/index.html`.

Deployed on its own, Save video uses the phone's share sheet when available (on iPhone, choose Save Video), otherwise a normal download.

## Tests

```bash
npm test                 # macOS
xvfb-run -a npm test     # Linux
```

- `test:shaders` renders every mode to `tests/out/modes.png`.
- `test:sim` runs the page against a fake 120 BPM track and checks tempo, hit and drop detection, Auto, the controls, full screen and multi-clip recording.

Working on it with Claude Code? See `CLAUDE.md`.
