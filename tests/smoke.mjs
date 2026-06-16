import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const fail = message => { throw new Error(message); };

new vm.Script(read("config.js"));
new vm.Script(read("game.js"));

const html = read("index.html");
const submission = read("submission.html");
const game = read("game.js");
const config = read("config.js");

if (html.indexOf("config.js") > html.indexOf("game.js")) fail("config.js must load before game.js");
for (const required of [
  "trench-runner-2086-trailer-final.mp4",
  "press/screenshots/02-dual-laser-first-contact.png",
  "index.html",
  "submission.css",
  "submission.js"
]) {
  if (!submission.includes(required)) fail(`Submission page is missing: ${required}`);
}

const ids = [...game.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map(match => match[1]);
const missing = [...new Set(ids)].filter(id => !html.includes(`id="${id}"`));
if (missing.length) fail(`Missing DOM ids: ${missing.join(", ")}`);

for (const asset of [
  "synthwave-loop.wav", "laser-dual.wav", "explosion-heavy.wav",
  "boost-ignite.wav", "mission-complete.wav"
]) {
  if (!fs.existsSync(path.join(root, "assets", "audio", asset))) fail(`Missing audio asset: ${asset}`);
}
for (const voice of [
  "control-launch.wav", "control-weapons-free.wav", "nexus-warning.wav",
  "archon-reveal.wav", "control-escape.wav", "control-finale.wav"
]) {
  if (!fs.existsSync(path.join(root, "assets", "audio", "voice", voice))) {
    fail(`Missing voice asset: ${voice}`);
  }
}
if (game.includes("speechSynthesis") || game.includes("SpeechSynthesisUtterance")) {
  fail("Runtime system speech synthesis must not be used");
}
for (const voiceFeature of ["audioVoice", "playVoice", "control-launch", "archon-reveal", "control-finale"]) {
  if (!game.includes(voiceFeature)) fail(`Voice production feature is missing: ${voiceFeature}`);
}
if (!fs.existsSync(path.join(root, "VOICE_CAST.md"))) fail("Voice cast documentation is missing");
if (!fs.existsSync(path.join(root, "assets", "visuals", "nexus-assault-keyart.png"))) {
  fail("Missing Nexus assault key art");
}

const durations = [...config.matchAll(/duration: (\d+)/g)].map(match => Number(match[1]));
if (durations[0] + durations[1] + durations[2] + durations[4] > 90) {
  fail("Challenge demo pacing exceeds target before boss time");
}

for (const feature of [
  "spawnWave", "advanceTutorial", "startCompletionCinematic",
  "calculateMissionRank", "exportTelemetry", "loadAudioAssets",
  "spawnScriptedFormation", "updateScriptedWaves", "drawMegastructure",
  "showMissionBeat", "disposeAudioOnEnd", "recordPerformance",
  "performanceReport", "updateBenchmarkPilot", "startTrailerRecording",
  "drawTrailerOverlay", "drawTrailerCaption", "prepareCaptureScene"
]) {
  if (!game.includes(`function ${feature}`)) fail(`Missing feature: ${feature}`);
}

const screenshotDir = path.join(root, "press", "screenshots");
const screenshots = fs.existsSync(screenshotDir)
  ? fs.readdirSync(screenshotDir).filter(file => file.endsWith(".png"))
  : [];
if (screenshots.length !== 9) fail(`Expected 9 press screenshots, found ${screenshots.length}`);

const trailer = path.join(root, "trailer", "trench-runner-2086-trailer-final.webm");
if (!fs.existsSync(trailer) || fs.statSync(trailer).size < 1_000_000) {
  fail("Rendered trailer is missing or unexpectedly small");
}
const mp4Trailer = path.join(root, "trailer", "trench-runner-2086-trailer-final.mp4");
if (!fs.existsSync(mp4Trailer) || fs.statSync(mp4Trailer).size < 1_000_000) {
  fail("Windows-compatible MP4 trailer is missing or unexpectedly small");
}
const trailerAudio = path.join(root, "trailer", "trench-runner-2086-trailer-audio.wav");
if (!fs.existsSync(trailerAudio) || fs.statSync(trailerAudio).size < 1_000_000) {
  fail("Deterministic trailer audio is missing or unexpectedly small");
}
if (!fs.existsSync(path.join(root, "trailer", "trailer-audio-cues.json"))) {
  fail("Trailer audio cue sheet is missing");
}
if (!game.includes("TR_OFFLINE_TRAILER") || !game.includes("renderFrame")) {
  fail("Deterministic offline trailer renderer is missing");
}
if (!fs.existsSync(path.join(root, "scripts", "render-trailer-offline.ps1"))) {
  fail("Offline trailer render script is missing");
}
for (const trailerScript of ["generate-trailer-audio.mjs", "mux-trailer-audio.ps1"]) {
  if (!fs.existsSync(path.join(root, "scripts", trailerScript))) fail(`Trailer sync script is missing: ${trailerScript}`);
}
for (const judgeFile of ["START-HERE.cmd", "Start-Jury-Run.cmd", "JURY_GUIDE.md", "Start-TrenchRunner.ps1"]) {
  if (!fs.existsSync(path.join(root, judgeFile))) fail(`Judge build file is missing: ${judgeFile}`);
}
const launcher = read("Start-TrenchRunner.ps1");
for (const requirement of ['ValidateSet("game", "jury", "submission")', "index.html?jury", "submission.html", "TcpListener", "HEAD"]) {
  if (!launcher.includes(requirement)) fail(`Local launcher is missing: ${requirement}`);
}
for (const juryRequirement of [
  'queryParams.has("jury")', 'JURY_MAX_SECONDS = 100',
  '[14, 18, 15, 99, 12]', 'selectedShipKey = juryMode ? "vanguard"',
  'window.TR_JURY'
]) {
  if (!game.includes(juryRequirement)) fail(`Jury mode is missing: ${juryRequirement}`);
}
if (!fs.existsSync(path.join(root, "JURY_MODE_REPORT.md"))) {
  fail("Jury mode verification report is missing");
}
if (!submission.includes("index.html?jury")) fail("Submission does not launch Jury Mode");
if (!submission.includes("data-jury-launch") || !read("submission.js").includes("data-jury-launch")) {
  fail("Submission page is missing the robust Jury Mode launcher");
}
if (!submission.includes("data-game-launch") || !read("submission.js").includes("data-game-launch")) {
  fail("Submission page is missing the full game launcher");
}
for (const accessibilityId of [
  "subtitlesEnabled", "colorVisionMode", "reducedMotion", "keybindGrid", "resetBindingsButton"
]) {
  if (!html.includes(`id="${accessibilityId}"`)) fail(`Accessibility control is missing: ${accessibilityId}`);
}
for (const accessibilityFeature of [
  "DEFAULT_BINDINGS", "applyAccessibilitySettings", "updateBindingButtons",
  "setBinding", "TR_ACCESSIBILITY", 'settings.reducedMotion ? .12 : 1'
]) {
  if (!game.includes(accessibilityFeature)) fail(`Accessibility feature is missing: ${accessibilityFeature}`);
}
for (const accessibilityFile of ["ACCESSIBILITY.md", "accessibility-report.json", "scripts/test-accessibility.ps1"]) {
  if (!fs.existsSync(path.join(root, accessibilityFile))) fail(`Accessibility artifact is missing: ${accessibilityFile}`);
}
for (const qaFile of ["scripts/qa-chromium.cjs", "scripts/qa-firefox.ps1", "scripts/run-final-qa.ps1"]) {
  if (!fs.existsSync(path.join(root, qaFile))) fail(`Final QA artifact is missing: ${qaFile}`);
}

console.log("Smoke tests passed");
