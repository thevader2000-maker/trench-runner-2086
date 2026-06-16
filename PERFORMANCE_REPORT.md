# Performance and balance report

Date: 2026-06-10

## Test setup

- Microsoft Edge headless
- GPU acceleration disabled for a conservative CPU-bound result
- 1280 x 720 viewport
- Vanguard interceptor
- Full mission with normal phase durations and normal weapon values
- Automated aiming only; damage disabled so every run reaches the finale

## Final Nightmare result

- Mission duration: 96.72 seconds
- Mission rank: A
- Average FPS: 55.7
- Minimum one-second FPS sample: 37.4
- Long frames above 34 ms: 2
- Automatic quality reductions: 0
- Maximum enemies: 7
- Maximum enemy projectiles: 51
- Maximum player projectiles: 24
- Maximum particles: 280

## Phase averages

| Phase | Average FPS | Long frames | Peak enemies | Peak enemy shots |
| --- | ---: | ---: | ---: | ---: |
| Approach | 59.1 | 0 | 5 | 0 |
| The Trench | 58.5 | 2 | 7 | 6 |
| Core Access | 54.9 | 0 | 7 | 6 |
| Core Guardian | 52.9 | 0 | 0 | 51 |
| Escape | 53.5 | 0 | 0 | 0 |

## Changes made

- WebAudio nodes are disconnected after playback.
- Target-lock and enemy-fire sounds are rate limited.
- Device pixel ratio is capped according to effects quality.
- Sustained low FPS automatically lowers runtime effects quality.
- Boss projectiles are capped and Event Horizon uses timed volleys.
- Escape particles were reduced from 420 to 280.
- Residual enemies are cleared before the boss introduction.
- Nightmare boss salvos are spaced further apart for readability.

## Balance findings

- Ace completes in approximately 96.7 seconds with a 16.6-second boss fight.
- Nightmare remains under 100 seconds in the automated run.
- Nightmare keeps faster projectiles and higher damage, but no longer relies on visually unreadable firing frequency.
- Scripted waves peak at seven simultaneous enemies and remain above 54 FPS in the conservative test.

Automated tests validate pacing and technical load. Human playtests are still required for perceived difficulty, clarity and enjoyment.
