# Jury mode verification

Date: 2026-06-14

## Preset

- Ship: Vanguard
- Difficulty: Ace
- Selection screen before first run: none
- Runtime limit: 100 seconds

## Automated full-run result

- Result screen reached after: 87.71 seconds
- Mission gameplay time: 75.59 seconds
- Mission result: complete
- Rank: A
- Boss deadline safeguard used: no

## Phase timing

| Phase | Reached at |
| --- | ---: |
| Approach | 0.00 s |
| The Trench | 14.01 s |
| Core Access | 32.02 s |
| Core Guardian | 47.04 s |
| Escape | 63.59 s |
| Completion cinematic | 75.59 s |
| Result screen | 87.71 s |

The test uses the normal game simulation and automated aiming. It verifies the complete combat and cinematic path without changing weapon damage or boss health.

Repeat with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\run-jury-mode-test.ps1
```
