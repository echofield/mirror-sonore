# Miroir Sonore

Drop a picture (an image or a video) and a sound. The picture folds, warps and hits with the music. Record vertical clips for TikTok, Reels or Shorts with the audio baked in, save still images, and keep the looks you like.

- **Modes:** Mirror, Kaleido, Tunnel, Liquid, Holo (iridescent foil), Fractal (Julia set), Infinite (endless zoom), Wave (the picture stays in place while the music runs through it from left to right), VHS (the picture played back from a worn tape; the Tape fader lays the same tape over any other mode).
- **Hands:** drag on the picture to play it. Sideways turns it, up and down zooms; two fingers set trails and warp. Let go and it springs back, or switch Latch on and it stays. Auto keeps running underneath.
- **Picture:** an image, or a video whose frames go through the same modes. A video dropped on the page is used for picture and sound.
- **Image:** saves the current frame as a PNG at the full export size.
- **Keep:** stores the whole look (direction, mode, colour, Beat, Pump, Flow, Auto) with a thumbnail. Tap a kept look to bring it back, hold it to remove it. Up to 12, kept in the browser.
- **Trips:** LSD, Psilocybin, DMT, Mescaline, Ayahuasca, Ketamine: art presets built from research descriptions of each experience's visuals. They add form-constant geometry (flat or funnel-shaped lattices), stepped tracers on the beat, breathing surfaces, and a Journey arc that builds and settles over each clip.
- **Directions:** Picture (colors taken from your image), Original (untouched), Neon, Holo, Gold, Ink, Dream, Ember.
- **Auto:** changes the look on a kick every 4, 8 or 16 bars, and on every drop, with a Morph dissolve or a hard Cut.
- **Beat, Pump and Flow:** your live intensity controls. Beat sets the hits (glitch, color split, flashes). Pump sets how much the kick sidechains the picture: Off, Duck, Punch or Breathe, with a length synced to the tempo. Flow sets the continuous motion.
- **Export:** 9:16, 1:1 or 4:5, in 720p or 1080p, at 15s, 30s, 60s or full track. Record 1, 3 or 5 variations of the same section in one go.
- Phone layout keeps the preview pinned while you edit. Full screen has floating controls.

Keys: Space play · R record · I image · K keep · S shuffle · A auto · T trip · P pump style · F full screen · 1–9 modes · arrows turn and zoom · Shift + arrows trails and warp · 0 centre · L latch.

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
npm test                 # macOS, Windows
xvfb-run -a npm test     # Linux
```

- `test:shaders` renders every mode to `tests/out/modes.png`.
- `test:sim` runs the page against a fake 120 BPM track and checks tempo, hit and drop detection, Auto, the controls, trips, the Wave and VHS modes, the hands, kept looks, still images, full screen and multi-clip recording.

Working on it with Claude Code? See `CLAUDE.md`.
