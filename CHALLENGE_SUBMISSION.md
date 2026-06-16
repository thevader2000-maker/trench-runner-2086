# Trench Runner 2086

## One-line pitch

A high-speed cockpit rail shooter that combines 1980s vector-arcade clarity with modern neon combat, reactive sound and a three-minute challenge run.

## Jury page

Open `submission.html` for the complete presentation: playable demo links, 60-second trailer, core design highlights, Codex iteration story, technical proof and full-resolution gallery.

For the packaged Windows build, double-click `START-HERE.cmd`. `JURY_GUIDE.md` provides a focused 90-second review path and technical evidence index.

The presentation offers both `Full game` and `Play jury run`. Jury Mode launches `?jury`: a zero-choice Vanguard/Ace run verified to reach the result screen within the 100-second cap. Full game mode opens the normal ship and difficulty selection.

The final QA matrix passes installed Chrome, Edge and Firefox at 1080p/1440p plus a GPU-disabled 1366x768 laptop profile. Console and network error counts are zero; the repeatable evidence is included in `FINAL_QA_REPORT.md`.

## Why it fits the Codex Challenge

The project was built through an iterative human-and-Codex workflow:

1. The original idea was translated into a legally distinct science-fiction setting.
2. Codex implemented the playable prototype and tested it in the browser.
3. Player feedback drove repeated changes to aiming, dual-cannon fire, audio, pacing and performance.
4. Codex diagnosed regressions, removed unsuccessful mechanics and preserved the working combat loop.
5. The final pass added choreographed formations, tutorial guidance, ship builds, The Archon boss encounter, a collapsing megastructure, cinematic escape and playtest telemetry.

## Technical highlights

- Dependency-free HTML5 Canvas renderer
- Fully offline generated WAV soundtrack and effects
- Six directed, pre-rendered neural voice performances with radio mastering and music ducking
- Keyboard and gamepad controls
- Three ships and three difficulty levels
- Retro vector and modern neon render modes
- Multi-phase named boss with targetable Crown Nodes and an Event Horizon finale
- Hit-stop, directional camera impact and scripted tactical beats
- Generated cinematic key art and a unified Nexus color language
- Local highscores and JSON playtest telemetry
- Configurable audio, sensitivity and effect quality

## Demo flow

1. In-cockpit tutorial and launch
2. Choreographed formation combat
3. Trench acceleration
4. The Archon boss and Event Horizon attack
5. Timed escape
6. Signal-loss dawn cinematic and mission rank

## Originality and rights

All names, graphics, code and generated audio are original to Trench Runner 2086. No protected franchise assets, characters or music are included.

## Challenge post template

Public GitHub repo: `<repo link>`

Playable game link: `<GitHub Pages / itch.io / Vercel link>`

Short description: Trench Runner 2086 is a cinematic browser cockpit shooter with a guided Jury Mode, full game mode, controller support, accessibility options, directed voice lines, synthwave audio and a 60-second trailer.
