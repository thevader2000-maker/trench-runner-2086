# GitHub Upload Checklist

Recommended public repo name: `trench-runner-2086`

## Before Upload

- Confirm the repo is public.
- Confirm GitHub Pages, itch.io or Vercel points at `submission.html`.
- Do not upload `.env`, tokens, credentials, `tools/`, `_backup_before_polish/`, `release/` or `.zip` files.
- Keep the playable root files and asset folders: `index.html`, `submission.html`, `game.js`, `config.js`, CSS, `assets/`, `press/`, `trailer/`, `scripts/`, `tests/` and the Markdown reports.

## README Requirements

The README now includes:

- What was made
- How Codex helped
- How to play
- Keyboard and gamepad controls
- QA and repository-safety notes

## Suggested Git Commands

Run these after Git is installed:

```powershell
git init
git branch -M main
git add .
git status
git commit -m "Submit Trench Runner 2086 challenge build"
git remote add origin https://github.com/<your-user>/trench-runner-2086.git
git push -u origin main
```

## GitHub Pages

After pushing:

1. Open repo Settings.
2. Go to Pages.
3. Set source to `Deploy from a branch`.
4. Select branch `main` and folder `/root`.
5. Use the Pages URL plus `/submission.html` as the playable game link.

## Final Challenge Post

```text
Public GitHub repo: https://github.com/<your-user>/trench-runner-2086
Playable game link: https://<your-user>.github.io/trench-runner-2086/submission.html
Short description: Trench Runner 2086 is a cinematic browser cockpit shooter with a guided Jury Mode, full game mode, controller support, accessibility options, directed voice lines, synthwave audio and a 60-second trailer.
```
