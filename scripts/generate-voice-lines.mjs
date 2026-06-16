import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "assets", "audio", "voice-raw");
const { KokoroTTS } = await import("kokoro-js");

const lines = [
  {
    id: "control-launch",
    voice: "af_heart",
    speed: 1.04,
    text: "Flight link confirmed. Vanguard, you are cleared to engage."
  },
  {
    id: "control-weapons-free",
    voice: "af_heart",
    speed: 1.02,
    text: "Training complete. Weapons free."
  },
  {
    id: "nexus-warning",
    voice: "af_bella",
    speed: .94,
    text: "Unauthorized craft detected. Core defenses active."
  },
  {
    id: "archon-reveal",
    voice: "am_fenrir",
    speed: .88,
    text: "You crossed a graveyard to reach me. Now join it."
  },
  {
    id: "control-escape",
    voice: "af_heart",
    speed: 1.08,
    text: "Core collapse confirmed. Full boost. Get out now."
  },
  {
    id: "control-finale",
    voice: "af_heart",
    speed: .9,
    text: "We hear you, pilot."
  }
];

fs.mkdirSync(output, { recursive: true });
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",
  device: "cpu"
});

for (const line of lines) {
  process.stdout.write(`Generating ${line.id}... `);
  const audio = await tts.generate(line.text, { voice: line.voice, speed: line.speed });
  await audio.save(path.join(output, `${line.id}.wav`));
  process.stdout.write("done\n");
}

fs.writeFileSync(
  path.join(output, "voice-lines.json"),
  JSON.stringify(lines, null, 2)
);
