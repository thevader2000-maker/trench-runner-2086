# Accessibility

## Defaults

- Radio subtitles are enabled by default.
- Keyboard and gamepad controls remain available simultaneously.
- Standard color palette and camera movement remain active until changed.

## Options

- Subtitles: on or off
- Color vision: standard, deuteranopia, protanopia or tritanopia
- Camera movement: standard or reduced
- Rebindable keyboard actions:
  - Move up, down, left and right
  - Fire
  - Boost
  - Shield pulse
  - Vector mode
  - Pause

Bindings and accessibility preferences are saved locally. Duplicate keyboard assignments are rejected so one key cannot silently trigger two actions.

## Verification

The automated browser test verifies:

- Subtitles enabled on a clean profile
- ARIA live-region semantics
- Color and motion preferences after reload
- Persistent fire remap from Space to F
- Actual laser fire from the remapped key
- Duplicate binding rejection

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\test-accessibility.ps1
```
