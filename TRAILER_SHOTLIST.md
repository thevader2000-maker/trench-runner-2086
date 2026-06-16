# 60-second trailer

Primary rendered file: `trailer/trench-runner-2086-trailer-final.mp4`

The MP4 uses 1,800 independently rendered frames at constant 30 FPS, H.264 video and AAC audio for Windows Media Player compatibility. The trailer audio is generated from a deterministic 60-second WAV cue sheet: the intro bed starts immediately, while gameplay impacts and radio lines are placed three seconds later after Windows Media Player sync review.

## 00:00-00:04

Black screen, radio static, title: `THE CORE GOES ONLINE`.

## 00:04-00:12

Mission start, cockpit lights and first dual-laser volley. Show the tutorial completing quickly.

## 00:12-00:20

Three rapid cuts between SINE, WEAVE and DIVE formations. Include white hit flashes and one close explosion.

## 00:20-00:25

Switch from modern neon mode to retro vector mode with `V`.

## 00:25-00:35

Core Guardian reveal. Destroy two shield nodes, then show `CORE EXPOSED`.

## 00:35-00:43

Final core hit, slow collapse, radio line: `Core collapse confirmed`.

## 00:43-00:50

Escape countdown, full boost, red critical HUD.

## 00:50-00:54

External explosion cinematic.

## 00:54-01:00

Final card:

`TRENCH RUNNER 2086`

`BUILT WITH CODEX`

The deterministic offline renderer advances the game by exactly 1/30 second per frame at 1920x1080. This avoids the baked-in stutter of real-time browser recording.

Re-render with:

```powershell
node scripts\generate-trailer-audio.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\render-trailer-offline.ps1
```

Refresh audio only after a visual render with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\mux-trailer-audio.ps1
```

For final subjective sync tuning, adjust `gameplaySyncDelay` in `scripts/generate-trailer-audio.mjs`, then regenerate the WAV and run the mux script.
