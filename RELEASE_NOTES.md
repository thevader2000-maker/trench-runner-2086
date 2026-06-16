# Challenge build

## Professional voice production

- Replaces browser system speech with six pre-rendered neural voice performances
- Gives CONTROL, NEXUS INTERCEPT and ARCHON distinct directed voices
- Adds radio mastering, antagonist spatial processing and automatic music ducking
- Keeps secondary radio traffic subtitle-only so featured lines retain impact
- Adds a voiced final "We hear you, pilot" beat to the mission cinematic

## Final quality assurance

- Passes installed Chrome 149 at 1920x1080, Edge 149 at 2560x1440 and Firefox 151 at 1920x1080
- Passes a 1366x768 laptop profile with low effects and reduced motion
- Verifies standard Gamepad API steering, dual fire and boost
- Reports zero browser console errors, uncaught page errors, failed requests or HTTP errors
- Adds repeatable `npm run test:qa` coverage, screenshots and `FINAL_QA_REPORT.md`

## Accessibility

- Enables radio subtitles by default and exposes them as an ARIA live region
- Adds deuteranopia, protanopia and tritanopia display palettes
- Adds reduced camera movement for shake and directional impact
- Adds persistent keyboard rebinding for movement, fire, boost, shield, vector mode and pause
- Prevents duplicate key assignments and keeps tutorial/menu labels synchronized

## Jury mode

- Adds `?jury` as a zero-choice first-run path
- Locks the first run to Vanguard and Ace
- Skips ship and difficulty selection and begins with a three-second briefing
- Rebalances phase timing to preserve the full mission arc within 100 seconds
- Adds a late boss safeguard and a hard 100-second runtime cap
- Adds `Start-Jury-Run.cmd` for direct local launch

## Judge-ready delivery

- Adds a prominent `START-HERE.cmd` one-click jury launcher
- Opens the submission page through a private local HTTP server
- Automatically selects the next free port when 8086 is occupied
- Adds `JURY_GUIDE.md` with a 90-second review path, controls and evidence index
- Supports direct game and presentation modes from the same launcher

## Jury submission

- Adds a dedicated offline `submission.html` presentation page
- Leads with the one-line pitch and direct playable-demo action
- Embeds the frame-accurate 60-second trailer
- Explains the human-and-Codex iteration process with concrete examples
- Presents curated gameplay captures and technical proof in jury reading order

## Press kit

- Includes nine curated 1920x1080 PNG screenshots
- Covers menu key art, dual lasers, formations, vector mode, Archon, Event Horizon, escape and finale
- Includes a labeled contact sheet and usage manifest
- Adds deterministic in-game capture scenes and a repeatable screenshot renderer

## Trailer

- Includes a rendered 60-second 1920x1080 gameplay trailer
- Primary delivery is now constant-30-FPS H.264/AAC MP4 for smooth Windows Media Player playback
- Replaced the four-FPS real-time browser capture with 1,800 independently rendered frames
- Replaces realtime WebM trailer audio with a deterministic 60-second WAV cue mix to prevent late audio drift
- Keeps the intro bed audible from the first frame while delaying gameplay cues by three seconds after Windows Media Player sync review
- Uses an exact 1/30-second simulation step, zero-based audio/video timestamps, no B-frames and fast-start metadata
- Covers opening hook, dual lasers, formations, vector mode, Archon, escape and final card
- Includes one recorded game-audio track
- Adds a repeatable deterministic offline trailer renderer

## Performance hotfix

- Disconnects completed WebAudio effect nodes instead of retaining them
- Debounces rapid target-lock sounds during dense formations
- Reduces hit-stop duration so multi-kill waves retain full speed
- Adds per-phase FPS and object-count telemetry plus repeatable benchmarks
- Caps high-resolution rendering at 1.5 device pixels per CSS pixel
- Reduces boss projectile and escape particle peaks
- Clears residual enemies before the boss introduction
- Improves Nightmare boss readability by spacing salvos slightly further apart

## Jury polish update

- Cinematic Nexus assault key art and unified color direction
- Fully choreographed waves for a consistent first playthrough
- Reworked boss identity: The Archon, Crown Nodes and Event Horizon finale
- Collapsing megastructure environment during the escape
- Hit-stop, directional camera impact and denser destruction feedback
- Adaptive procedural score layered over the synthwave music bed
- Extended quiet-dawn ending with a final Control transmission

## Highlights

- Three-to-four-minute demo pacing
- Guided in-cockpit tutorial
- Radio dialogue and objective calls
- Generated WAV soundtrack and layered effects
- Formation-based enemy waves
- Multi-stage Core Guardian boss
- Boost-scored escape sequence
- Cinematic station destruction
- Mission rank and accuracy report
- Three ships and three difficulties
- Settings and playtest telemetry export

## Start

Double-click `Start-TrenchRunner.cmd`.

Chrome, Edge or Firefox is recommended. Headphones improve directional audio.
