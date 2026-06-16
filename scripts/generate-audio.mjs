import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "assets", "audio");
fs.mkdirSync(output, { recursive: true });

const sampleRate = 22050;
const clamp = value => Math.max(-1, Math.min(1, value));

function writeWav(name, seconds, render, channels = 2) {
  const frames = Math.floor(sampleRate * seconds);
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
    const t = i / sampleRate;
    const values = render(t, i, frames);
    for (let channel = 0; channel < channels; channel++) {
      const value = Array.isArray(values) ? values[channel] : values;
      buffer.writeInt16LE(Math.round(clamp(value) * 32767), 44 + (i * channels + channel) * 2);
    }
  }
  fs.writeFileSync(path.join(output, name), buffer);
}

function noise(i) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function kick(t, beat) {
  const local = t - beat;
  if (local < 0 || local > .3) return 0;
  return Math.sin(2 * Math.PI * (45 * local + 38 * Math.exp(-local * 28))) * Math.exp(-local * 18);
}

writeWav("synthwave-loop.wav", 16, (t, i) => {
  const bpm = 128;
  const beat = 60 / bpm;
  const step = beat / 2;
  const bar = Math.floor(t / (beat * 4));
  const roots = [55, 65.406, 48.999, 73.416];
  const root = roots[bar % roots.length];
  const localStep = Math.floor(t / step);
  const phase = t % step;
  const arp = [1, 1.5, 2, 3, 2, 1.5, 4, 3][localStep % 8];
  const bass = Math.tanh(Math.sin(2 * Math.PI * root * t) * 1.8) * Math.exp(-phase * 3.5) * .17;
  const lead = Math.sign(Math.sin(2 * Math.PI * root * arp * 4 * t)) * Math.exp(-phase * 10) * .055;
  let drum = 0;
  const beatStart = Math.floor(t / beat) * beat;
  drum += kick(t, beatStart) * .34;
  const beatInBar = Math.floor(t / beat) % 4;
  if ((beatInBar === 1 || beatInBar === 3) && t - beatStart < .14) {
    drum += noise(i) * Math.exp(-(t - beatStart) * 24) * .16;
  }
  const hatPhase = t % (step / 2);
  const hat = noise(i + 99) * Math.exp(-hatPhase * 90) * .035;
  const pad = (
    Math.sin(2 * Math.PI * root * 2 * t) +
    Math.sin(2 * Math.PI * root * 2.5 * t) +
    Math.sin(2 * Math.PI * root * 3 * t)
  ) * .025;
  const side = Math.sin(t * .4) * .02;
  return [bass + lead + drum + hat + pad + side, bass + lead * .85 + drum + hat - side + pad];
});

writeWav("laser-dual.wav", .22, (t, i) => {
  const env = Math.exp(-t * 18);
  const freq = 1180 * Math.exp(-t * 10) + 105;
  const body = Math.tanh(Math.sin(2 * Math.PI * freq * t) * 2.1) * env;
  const spark = noise(i) * Math.exp(-t * 55) * .15;
  return [body * .48 + spark, body * .48 - spark];
});

writeWav("explosion-heavy.wav", 1.35, (t, i) => {
  const rumble = Math.sin(2 * Math.PI * (72 * Math.exp(-t * 2.8) + 26) * t) * Math.exp(-t * 2.8);
  const debris = noise(i) * Math.exp(-t * 4.1);
  const crack = noise(i * 7) * Math.exp(-t * 28);
  return [rumble * .48 + debris * .23 + crack * .18, rumble * .48 + debris * .2 - crack * .16];
});

writeWav("boost-ignite.wav", .85, (t, i) => {
  const rise = Math.min(1, t * 7);
  const fade = Math.exp(-Math.max(0, t - .42) * 3);
  const engine = Math.tanh(Math.sin(2 * Math.PI * (55 + t * 230) * t) * 1.9);
  const air = noise(i) * (.08 + rise * .18);
  return [engine * rise * fade * .3 + air * fade, engine * rise * fade * .3 + air * fade];
});

writeWav("mission-complete.wav", 3.2, t => {
  const notes = [220, 277.18, 329.63, 440];
  let value = 0;
  for (let n = 0; n < notes.length; n++) {
    const start = n * .38;
    const local = t - start;
    if (local >= 0) value += Math.sin(2 * Math.PI * notes[n] * local) * Math.exp(-local * 1.5) * .12;
  }
  return [value, value];
});

console.log(`Generated audio assets in ${output}`);
