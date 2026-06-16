import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "trailer", "trench-runner-2086-trailer-audio.wav");
const cuePath = path.join(root, "trailer", "trailer-audio-cues.json");
const sampleRate = 48000;
const duration = 60;
const channels = 2;
const frames = sampleRate * duration;
const mix = [new Float32Array(frames), new Float32Array(frames)];
const gameplaySyncDelay = 3.0;

function cueTime(seconds) {
  return seconds >= 3.8 ? seconds + gameplaySyncDelay : seconds;
}

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function readWav(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Unsupported WAV file: ${file}`);
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14)
      };
    } else if (id === "data") {
      data = buffer.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!fmt || !data || fmt.format !== 1 || fmt.bits !== 16) {
    throw new Error(`Only PCM 16-bit WAV is supported: ${file}`);
  }
  const sourceFrames = Math.floor(data.length / (fmt.channels * 2));
  const samples = Array.from({ length: fmt.channels }, () => new Float32Array(sourceFrames));
  for (let i = 0; i < sourceFrames; i++) {
    for (let ch = 0; ch < fmt.channels; ch++) {
      samples[ch][i] = data.readInt16LE((i * fmt.channels + ch) * 2) / 32768;
    }
  }
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, frames: sourceFrames, samples };
}

function sampleAt(asset, ch, sourcePosition) {
  if (sourcePosition < 0 || sourcePosition >= asset.frames - 1) return 0;
  const i = Math.floor(sourcePosition);
  const frac = sourcePosition - i;
  const channel = asset.samples[Math.min(ch, asset.channels - 1)];
  return channel[i] * (1 - frac) + channel[i + 1] * frac;
}

function addAsset(asset, atSeconds, gain = 1, pan = 0, fadeIn = 0.01, fadeOut = 0.04, maxSeconds = Infinity) {
  const start = Math.floor(atSeconds * sampleRate);
  const length = Math.min(Math.floor(maxSeconds * sampleRate), Math.floor(asset.frames * sampleRate / asset.sampleRate));
  const leftGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < length; i++) {
    const target = start + i;
    if (target < 0 || target >= frames) continue;
    const t = i / sampleRate;
    const remaining = (length - i) / sampleRate;
    const env = Math.min(1, fadeIn > 0 ? t / fadeIn : 1, fadeOut > 0 ? remaining / fadeOut : 1);
    const sourcePosition = i * asset.sampleRate / sampleRate;
    const l = sampleAt(asset, 0, sourcePosition);
    const r = asset.channels > 1 ? sampleAt(asset, 1, sourcePosition) : l;
    mix[0][target] += l * leftGain * env;
    mix[1][target] += r * rightGain * env;
  }
}

function addLoop(asset, from, to, gain = 1) {
  let cursor = from;
  while (cursor < to) {
    const maxSeconds = Math.min(to - cursor, asset.frames / asset.sampleRate);
    addAsset(asset, cursor, gain, 0, cursor === from ? 1.6 : 0.03, to - cursor <= maxSeconds ? 1.4 : 0.03, maxSeconds);
    cursor += maxSeconds;
  }
}

function addTone(at, seconds, frequency, gain, type = "sine", pan = 0, slide = 0) {
  const start = Math.floor(at * sampleRate);
  const length = Math.floor(seconds * sampleRate);
  const leftGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = gain * Math.sin((pan + 1) * Math.PI / 4);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const target = start + i;
    if (target < 0 || target >= frames) continue;
    const t = i / sampleRate;
    const f = frequency + slide * (t / Math.max(seconds, 0.001));
    phase += 2 * Math.PI * f / sampleRate;
    const env = Math.min(1, t / 0.025, (seconds - t) / 0.08);
    const wave = type === "square" ? Math.sign(Math.sin(phase)) : type === "saw" ? 2 * (phase / (2 * Math.PI) % 1) - 1 : Math.sin(phase);
    mix[0][target] += wave * leftGain * env;
    mix[1][target] += wave * rightGain * env;
  }
}

function addNoise(at, seconds, gain, pan = 0, highpass = false) {
  const start = Math.floor(at * sampleRate);
  const length = Math.floor(seconds * sampleRate);
  const leftGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rightGain = gain * Math.sin((pan + 1) * Math.PI / 4);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const target = start + i;
    if (target < 0 || target >= frames) continue;
    const t = i / sampleRate;
    const raw = Math.sin((i + start) * 12.9898 + 78.233) * 43758.5453;
    let value = (raw - Math.floor(raw)) * 2 - 1;
    if (highpass) {
      const hp = value - last;
      last = value;
      value = hp;
    }
    const env = Math.min(1, t / 0.03) * Math.exp(-t * 2.4);
    mix[0][target] += value * leftGain * env;
    mix[1][target] += value * rightGain * env;
  }
}

function writeWav(file) {
  const dataSize = frames * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    const duck = i > 54.0 * sampleRate && i < 56.6 * sampleRate ? 0.72 : 1;
    const l = Math.tanh(mix[0][i] * duck * 0.92);
    const r = Math.tanh(mix[1][i] * duck * 0.92);
    buffer.writeInt16LE(Math.round(clamp(l) * 32767), 44 + (i * channels) * 2);
    buffer.writeInt16LE(Math.round(clamp(r) * 32767), 44 + (i * channels + 1) * 2);
  }
  fs.writeFileSync(file, buffer);
}

const audio = name => readWav(path.join(root, "assets", "audio", name));
const voice = name => readWav(path.join(root, "assets", "audio", "voice", name));
const music = audio("synthwave-loop.wav");
const laser = audio("laser-dual.wav");
const explosion = audio("explosion-heavy.wav");
const boost = audio("boost-ignite.wav");
const complete = audio("mission-complete.wav");

const cues = [
  { time: 0.2, event: "static and title swell" },
  { time: cueTime(4.2), event: "CONTROL launch line" },
  { time: cueTime(9.2), event: "dual laser volley" },
  { time: cueTime(12.2), event: "weapons free" },
  { time: cueTime(20.0), event: "vector mode switch" },
  { time: cueTime(25.0), event: "NEXUS warning" },
  { time: cueTime(31.2), event: "ARCHON reveal" },
  { time: cueTime(39.0), event: "core collapse escape command" },
  { time: cueTime(50.0), event: "external detonation" },
  { time: cueTime(54.2), event: "final CONTROL confirmation" }
];

addNoise(0, 3.6, 0.1, 0, true);
addTone(0.3, 3.2, 46, 0.11, "sine", 0, 42);
addLoop(music, 3.8, 54.2, 0.24);
addLoop(music, 54.2, 60, 0.08);

addAsset(voice("control-launch.wav"), cueTime(4.2), 0.9, -0.08, 0.01, 0.08);
addAsset(laser, cueTime(8.2), 0.65, -0.55);
addAsset(laser, cueTime(8.32), 0.65, 0.55);
addAsset(laser, cueTime(9.2), 0.7, -0.45);
addAsset(laser, cueTime(9.34), 0.7, 0.45);
addAsset(voice("control-weapons-free.wav"), cueTime(12.15), 0.86, -0.05, 0.01, 0.08);

for (const t of [13.2, 15.4, 17.8]) {
  addAsset(laser, cueTime(t), 0.58, -0.4);
  addAsset(laser, cueTime(t + 0.08), 0.58, 0.4);
  addAsset(explosion, cueTime(t + 0.55), 0.32, t === 15.4 ? 0.45 : -0.35, 0.01, 0.5, 0.9);
}

addTone(cueTime(20.0), 0.9, 880, 0.08, "square", 0, -420);
addNoise(cueTime(20.0), 1.2, 0.06, 0, true);
addAsset(voice("nexus-warning.wav"), cueTime(25.0), 0.82, 0.05, 0.01, 0.08);
addTone(cueTime(29.6), 1.6, 68, 0.12, "saw", 0, -20);
addAsset(voice("archon-reveal.wav"), cueTime(31.2), 0.92, 0, 0.01, 0.14);
addAsset(explosion, cueTime(34.8), 0.38, -0.25, 0.01, 0.45, 1.15);
addAsset(explosion, cueTime(37.1), 0.5, 0.3, 0.01, 0.55, 1.25);
addAsset(voice("control-escape.wav"), cueTime(39.0), 0.9, -0.08, 0.01, 0.08);
addAsset(boost, cueTime(43.0), 0.58, 0, 0.02, 0.4);
addNoise(cueTime(44.0), 5.2, 0.05, 0, true);
addTone(cueTime(48.4), 1.4, 105, 0.1, "saw", 0, 210);
addAsset(explosion, cueTime(50.0), 0.82, 0, 0.01, 1.4, 2.2);
addAsset(complete, cueTime(51.4), 0.32, 0, 0.02, 1.2, 3.0);
addAsset(voice("control-finale.wav"), cueTime(54.35), 0.86, 0, 0.01, 0.18);
addTone(cueTime(56.6), 2.8, 220, 0.045, "sine", -0.15, 110);
addTone(cueTime(57.2), 2.4, 329.63, 0.035, "sine", 0.15, 80);

writeWav(outPath);
fs.writeFileSync(cuePath, JSON.stringify({ durationSeconds: duration, sampleRate, gameplaySyncDelaySeconds: gameplaySyncDelay, cues }, null, 2));
console.log(`Wrote ${outPath}`);
