// A clip written frame by frame: every frame is drawn at the full output size, encoded, and put into
// an MP4 with the clip's own stretch of the song. Nothing depends on how fast the device is, so a phone
// gets the same file as a computer. The encoding is the browser's (WebCodecs); the file is written by
// Mediabunny (MPL-2.0, https://mediabunny.dev).
import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, Quality, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec } from 'mediabunny';

const known = {};
// Which codecs this browser can write at this size, or null when it cannot (the clip is then recorded live).
export async function exactSupport(w, h) {
  const key = w + 'x' + h;
  if (!(key in known)) {
    known[key] = null;
    try {
      if (typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function') {
        const fmt = new Mp4OutputFormat(), vs = fmt.getSupportedVideoCodecs(), as = fmt.getSupportedAudioCodecs();
        const video = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'].filter(c => vs.indexOf(c) >= 0), { width: w, height: h });
        const audio = await getFirstEncodableAudioCodec(['aac', 'opus'].filter(c => as.indexOf(c) >= 0), { numberOfChannels: 2, sampleRate: 44100 });
        if (video && audio) known[key] = { video, audio };
      }
    } catch (e) { known[key] = null; }
  }
  return known[key];
}

// The clip's stretch of the decoded song, as a sound of its own (4 ms in and out so the cut does not click).
export function clipSound(buffer, t0, len) {
  const sr = buffer.sampleRate, n = Math.max(1, Math.round(len * sr)), s0 = Math.round(t0 * sr), fade = Math.min(n >> 1, Math.round(sr * .004));
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr });
  for (let c = 0; c < 2; c++) {
    const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)), dst = out.getChannelData(c);
    for (let i = 0; i < n; i++) { const j = s0 + i; dst[i] = j >= 0 && j < src.length ? src[j] : 0; }
    for (let i = 0; i < fade; i++) { dst[i] *= i / fade; dst[n - 1 - i] *= i / fade; }
  }
  return out;
}

// codecs: from exactSupport. drawFrame(i) draws frame i on the canvas. sound: an AudioBuffer holding
// exactly the clip (or a function that makes it). onProgress(0..1). stopped() true gives up; the answer is then null.
export async function writeClip({ canvas, codecs, fps, frames, bitrate, drawFrame, sound, onProgress, stopped }) {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: codecs.video, quality: new Quality({ bitrate }), keyFrameInterval: 1 });
  const audio = new AudioBufferSource({ codec: codecs.audio, quality: new Quality({ bitrate: 192000 }) });
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(audio);
  await output.start();
  try {
    for (let i = 0; i < frames; i++) {
      if (stopped && stopped()) { await output.cancel(); return null; }
      drawFrame(i);
      await video.add(i / fps, 1 / fps);
      if (i % 3 === 0) { if (onProgress) onProgress(i / frames); await new Promise(r => setTimeout(r, 0)); }   // let the page breathe: progress, Stop
    }
    await audio.add(typeof sound === 'function' ? sound() : sound);
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch (e2) { /* already closed */ }
    throw e;
  }
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
