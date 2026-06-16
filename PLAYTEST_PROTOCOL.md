# Playtest protocol

Run the game with at least five people who have not seen it before.

## Instructions

Give testers only this sentence:

> Destroy the core and escape. The game will teach you the controls.

Do not explain the aiming system unless the tester is blocked for more than 30 seconds.

## Observe

- Time until first successful hit
- Whether dual lasers visually match the crosshair
- Tutorial step where hesitation occurs
- Whether shield and boost are used voluntarily
- Boss shield-node comprehension
- Escape countdown comprehension
- Total session length

## Collect

After each run, use `PLAYTEST-DATEN` on the result screen and retain the exported JSON.

The exported JSON now includes per-phase performance metrics:

- Average and minimum FPS
- Long frames above 34 ms
- Maximum enemies, projectiles and particles
- Automatic quality reductions

For a repeatable automated run, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-performance-benchmark.ps1 -Difficulty ace
```

Ask:

1. What was unclear?
2. What felt best?
3. What felt slow?
4. Did the boss weakness make sense?
5. Would you immediately play a second run with another ship?

## Acceptance targets

- First hit within 20 seconds
- At least 80% complete the tutorial without help
- At least 60% identify the boss shield nodes unaided
- Median run length below five minutes
- No repeated frame drops during combat
