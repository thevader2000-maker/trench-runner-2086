# Capture guide

The project now includes a complete automated 1920x1080 press kit:

- `press/screenshots/` contains nine full-resolution PNG files.
- `press/screenshots-contact-sheet.jpg` shows the complete set.
- `press/README.md` describes the recommended use for each image.

Regenerate the screenshots with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\capture-press-kit.ps1
```

Use `-ScenesOnly` to regenerate only Archon, Event Horizon, escape and finale screenshots.
