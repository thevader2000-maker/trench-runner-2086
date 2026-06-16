# Trench Runner 2086

Trench Runner 2086 is a cinematic HTML5 cockpit shooter built for the Codex game challenge. It runs as a static browser game with no backend and no runtime dependencies.

## What I Made

You fly through Omega airspace, hold a fixed cockpit reticle on target, fire synchronized left/right lasers, survive formation waves, break The Archon's shield nodes and escape a collapsing station.

The build includes:

- Full game mode with ship and difficulty selection
- Jury Mode with Vanguard, Ace difficulty and a maximum 100-second guided run
- Keyboard and gamepad support
- Accessibility options: subtitles on by default, color-vision modes, reduced camera motion and rebindable controls
- Synthwave music, layered sound effects and pre-rendered radio voice lines
- A 60-second trailer and submission page
- Local reports for QA, performance, accessibility and jury-mode verification

## How Codex Helped

Codex helped build and polish the game through an iterative workflow:

- Reworked aiming so the laser lines up with the center reticle
- Added true dual laser fire from left and right cannons
- Improved wave pacing, hit feedback, boss readability and the cinematic ending
- Removed mechanics that slowed the game down and profiled second-wave performance issues
- Added sound design, voice-line integration and audio cleanup
- Built Jury Mode for a no-choice first run
- Added accessibility settings and final QA scripts
- Generated repeatable press captures and rebuilt the trailer with deterministic frame rendering
- Prepared the submission page, release package and README

## How To Play

Recommended start for judges:

```powershell
.\START-HERE.cmd
```

This opens the submission page with both:

- `Play jury run`: direct guided challenge mode
- `Full game`: normal ship and difficulty selection

Direct local links when the launcher is running:

- Submission page: `http://127.0.0.1:8086/submission.html`
- Full game: `http://127.0.0.1:8086/index.html`
- Jury Mode: `http://127.0.0.1:8086/index.html?jury`

The project can also be hosted as a static site on GitHub Pages, Netlify, Vercel or itch.io. Use `submission.html` as the main presentation page.

## Controls

Keyboard:

- `W/A/S/D`: steer the target corridor
- `Space`: fire lasers
- `Shift`: boost
- `E`: shield pulse
- `V`: retro vector mode
- `Esc`: pause

Gamepad:

- Left stick: steer
- RT: fire
- RB: boost
- LB: shield

All keyboard actions can be rebound in `Options`.

## Quality Checks

Run the smoke test:

```powershell
npm test
```

Run the broader QA script:

```powershell
npm run test:qa
```

The latest QA notes are in:

- `FINAL_QA_REPORT.md`
- `JURY_MODE_REPORT.md`
- `ACCESSIBILITY.md`
- `PERFORMANCE_REPORT.md`

## Repository Safety

This project does not require API keys. Do not commit `.env` files, tokens, credentials or local tool downloads. The `.gitignore` excludes generated release archives, local FFmpeg tools, logs and backup folders.
