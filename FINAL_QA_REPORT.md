# Final QA Report

Overall: **PASS**

| Browser | Version | Profile | Viewport | Result | Console | Network |
| --- | --- | --- | --- | --- | ---: | ---: |
| chrome | 149.0.7827.54 | desktop | 1920x1080 | PASS | 0 | 0 |
| edge | 149.0.4022.69 | desktop | 2560x1440 | PASS | 0 | 0 |
| chrome | 149.0.7827.54 | laptop | 1366x768 | PASS | 0 | 0 |
| firefox | 151.0.4 | desktop | 1920x1080 | PASS | 0 | 0 |

## Coverage

- Installed Chrome at 1920x1080
- Installed Edge at 2560x1440
- Installed Firefox at 1920x1080
- Laptop profile at 1366x768 with low effects, reduced motion and a 30 FPS floor
- Standard Gamepad API input: left stick steering, RT dual fire and RB boost
- Six decoded pre-rendered voice assets with active CONTROL playback
- Browser console errors, uncaught page errors, failed requests and HTTP 4xx/5xx responses
- Submission assets, trailer metadata, horizontal overflow and canvas sizing

## Hardware Note

Laptop and gamepad coverage is deterministic browser-level simulation. Perform one final spot check on the exact presentation laptop and physical controller before judging.
