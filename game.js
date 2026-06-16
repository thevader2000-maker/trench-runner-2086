(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const $ = (s) => document.querySelector(s);
  const ui = {
    menu: $("#menu"), briefing: $("#briefing"), pause: $("#pause"), result: $("#result"),
    leaderboard: $("#leaderboard"), settings: $("#settings"), hud: $("#hud"), score: $("#score"), speed: $("#speed"),
    hostiles: $("#hostiles"), phase: $("#phaseLabel"), timer: $("#missionTimer"),
    hullBar: $("#hullBar"), shieldBar: $("#shieldBar"), boostBar: $("#boostBar"),
    hullText: $("#hullText"), shieldText: $("#shieldText"), boostText: $("#boostText"),
    status: $("#statusMessage"), bossHud: $("#bossHud"), bossBar: $("#bossBar"), bossLabel: $("#bossLabel"),
    escapeHud: $("#escapeHud"), escapeCountdown: $("#escapeCountdown"), escapeBonus: $("#escapeBonus"),
    radio: $("#radioMessage"), radioSpeaker: $("#radioSpeaker"), radioText: $("#radioText"),
    tutorial: $("#tutorialHint"), tutorialTitle: $("#tutorialTitle"), tutorialText: $("#tutorialText"),
    missionBeat: $("#missionBeat"), missionBeatKicker: $("#missionBeatKicker"),
    missionBeatTitle: $("#missionBeatTitle"), missionBeatText: $("#missionBeatText"),
    crosshair: $("#crosshair"),
    countdown: $("#countdown"), toast: $("#toast"), benchmarkReport: $("#benchmarkReport")
  };

  const PHASES = window.TR_CONFIG.phases;
  const SHIPS = window.TR_CONFIG.ships;
  const DIFFICULTIES = window.TR_CONFIG.difficulties;

  let W = 0, H = 0, DPR = 1, last = 0, state = "menu", briefingTimer = 5, cinematicTime = 0;
  let audio = null, audioMaster = null, audioSfx = null, audioMusic = null, audioVoice = null, audioUnlock = null;
  let audioReverb = null, audioDelay = null, reverbSend = null, delaySend = null;
  let trailerAudioDestination = null;
  let noiseBuffer = null, musicClock = null, nextBeat = 0, beatStep = 0;
  let engineOsc = null, engineGain = null, engineNoise = null, engineNoiseGain = null, boostSounding = false;
  let assetBuffers = {}, assetsLoading = null, musicAssetSource = null, currentVoiceSource = null;
  let lastLockSoundAt = -1, lastEnemyLaserAt = -1;
  let vectorMode = false, shake = 0, flash = 0, keys = {};
  let hitStop = 0, cameraKickX = 0, cameraKickY = 0, scriptedBeat = 0, finaleCue = 0, finaleVoicePlayed = false;
  let player, enemies, shots, enemyShots, particles, stars, powerups, rings, gameTime, phaseTime, phaseIndex;
  let spawnTimer, turretTimer, waveIndex, combo, comboTimer, maxCombo, score, kills, boss, escapeStarted;
  let escapeBonus, escapeWarningSecond, collapsePulse;
  let currentTarget, previousTarget, hitMarker, muzzleFlash;
  let shotsFired, shotsHit, damageSustained, missionRank;
  let tutorialStep, tutorialProgress, tutorialDone, radioQueue, radioBusy;
  let telemetry, performanceStats, runtimeEffects;
  const queryParams = new URLSearchParams(location.search);
  const benchmarkMode = queryParams.has("benchmark");
  const juryMode = queryParams.has("jury");
  const offlineTrailerMode = queryParams.has("offlineTrailer");
  const trailerMode = queryParams.has("trailer") || offlineTrailerMode;
  const captureScene = queryParams.get("capture");
  const captureMode = Boolean(captureScene);
  const autoPilotMode = benchmarkMode || trailerMode;
  const benchmarkDifficulty = queryParams.get("difficulty");
  const JURY_BOSS_DEADLINE = 78.5;
  const JURY_MAX_SECONDS = 100;
  let juryClock = 0, juryBossAssist = false;
  let trailerClock = 0, trailerRecorder = null, trailerChunks = [], trailerRecording = false;
  const DEFAULT_BINDINGS = Object.freeze({
    up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD",
    fire: "Space", boost: "ShiftLeft", shield: "KeyE", vector: "KeyV", pause: "Escape"
  });
  const BINDING_LABELS = Object.freeze({
    up: "HOCH", down: "RUNTER", left: "LINKS", right: "RECHTS",
    fire: "LASER", boost: "BOOST", shield: "SCHILD", vector: "VECTOR", pause: "PAUSE"
  });
  let rebindingAction = null;
  if (trailerMode) {
    [8, 9, 8, 99, 9].forEach((duration, index) => { PHASES[index].duration = duration; });
  } else if (juryMode) {
    [14, 18, 15, 99, 12].forEach((duration, index) => { PHASES[index].duration = duration; });
  }
  let savedSettings = null;
  try { savedSettings = JSON.parse(localStorage.getItem("trenchRunnerSettings") || "null"); } catch {}
  let settings = {
    music: 24, sfx: 90, sensitivity: 100, effects: "high",
    subtitles: true, colorVision: "normal", reducedMotion: false,
    ...(savedSettings || {}),
    bindings: { ...DEFAULT_BINDINGS, ...(savedSettings?.bindings || {}) }
  };
  let selectedShipKey = juryMode ? "vanguard" : localStorage.getItem("trenchRunnerShip") || "vanguard";
  let selectedShip = SHIPS[selectedShipKey] || SHIPS.vanguard;
  let selectedDifficultyKey = juryMode
    ? "ace"
    : trailerMode
    ? "ace"
    : benchmarkMode && DIFFICULTIES[benchmarkDifficulty]
    ? benchmarkDifficulty
    : localStorage.getItem("trenchRunnerDifficulty") || "ace";
  let selectedDifficulty = DIFFICULTIES[selectedDifficultyKey] || DIFFICULTIES.ace;

  function resize() {
    const dprCap = trailerMode || captureMode ? 1 : runtimeEffects === "low" ? 1 : runtimeEffects === "medium" ? 1.25 : 1.5;
    DPR = Math.min(devicePixelRatio || 1, dprCap);
    W = trailerMode || captureMode ? 1920 : innerWidth;
    H = trailerMode || captureMode ? 1080 : innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    makeStars();
  }

  function makeStars() {
    stars = Array.from({ length: Math.floor(W * H / 7000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: Math.random(), s: Math.random() * 1.8 + .2
    }));
  }

  function resetGame() {
    player = {
      x: 0, y: 0, vx: 0, vy: 0,
      hull: selectedShip.hull, maxHull: selectedShip.hull,
      shield: selectedShip.shield, maxShield: selectedShip.shield,
      boost: 100, fire: 0, inv: 0, pulse: 0
    };
    enemies = []; shots = []; enemyShots = []; particles = []; powerups = []; rings = [];
    gameTime = 0; phaseTime = 0; phaseIndex = 0; spawnTimer = 1.2; turretTimer = 3; waveIndex = 0;
    combo = 1; comboTimer = 0; maxCombo = 1; score = 0; kills = 0; boss = null; escapeStarted = false;
    shotsFired = 0; shotsHit = 0; damageSustained = 0; missionRank = "C"; cinematicTime = 0;
    tutorialStep = 0; tutorialProgress = 0; tutorialDone = false; radioQueue = []; radioBusy = false;
    hitStop = 0; cameraKickX = 0; cameraKickY = 0; scriptedBeat = 0; finaleCue = 0; finaleVoicePlayed = false;
    juryClock = 0; juryBossAssist = false;
    trailerClock = 0; trailerChunks = []; trailerRecording = false;
    runtimeEffects = settings.effects;
    performanceStats = {
      warmup: 1, frameCount: 0, elapsed: 0, fps: 60, averageFps: 60, minFps: 60,
      longFrames: 0, slowSamples: 0, qualityDrops: 0,
      maxEnemies: 0, maxEnemyShots: 0, maxPlayerShots: 0, maxParticles: 0,
      phases: PHASES.map(phase => ({
        phase: phase.name, frames: 0, elapsed: 0, longFrames: 0,
        minFps: 60, maxEnemies: 0, maxEnemyShots: 0, maxParticles: 0
      }))
    };
    telemetry = {
      version: "challenge-demo-1", startedAt: new Date().toISOString(),
      ship: selectedShip.name, difficulty: selectedDifficulty.name,
      tutorialCompletedAt: null, phases: [], result: null
    };
    escapeBonus = 0; escapeWarningSecond = -1; collapsePulse = 0;
    currentTarget = null; previousTarget = null; hitMarker = 0; muzzleFlash = 0;
    ui.phase.textContent = `${PHASES[0].name} // ${selectedDifficulty.name}`;
    ui.escapeHud.classList.add("hidden");
    ui.escapeHud.classList.remove("critical");
    ui.hud.classList.remove("escape-danger");
    ui.radio.classList.remove("show");
    ui.missionBeat.classList.remove("show");
    ui.tutorial.classList.add("hidden");
  }

  function effectsLevel() {
    return runtimeEffects || settings.effects;
  }

  function actionPressed(action) {
    return Boolean(keys[settings.bindings[action]]);
  }

  function keyName(code) {
    const names = {
      Space: "SPACE", ShiftLeft: "L-SHIFT", ShiftRight: "R-SHIFT",
      ControlLeft: "L-CTRL", ControlRight: "R-CTRL", AltLeft: "L-ALT", AltRight: "R-ALT",
      ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
      Escape: "ESC", Enter: "ENTER", Backspace: "BACKSPACE"
    };
    if (names[code]) return names[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    return code.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
  }

  function applyAccessibilitySettings() {
    document.body.classList.toggle("subtitles-off", !settings.subtitles);
    document.body.classList.toggle("reduced-camera", settings.reducedMotion);
    document.body.dataset.colorVision = settings.colorVision || "normal";
    if (!settings.subtitles) ui.radio.classList.remove("show");
  }

  function updateBindingButtons() {
    document.querySelectorAll(".keybind-button").forEach(button => {
      const action = button.dataset.bindAction;
      button.classList.toggle("listening", rebindingAction === action);
      const key = button.querySelector("kbd");
      if (key) key.textContent = rebindingAction === action ? "TASTE..." : keyName(settings.bindings[action]);
    });
    document.querySelectorAll("[data-control-action]").forEach(element => {
      element.textContent = keyName(settings.bindings[element.dataset.controlAction]);
    });
  }

  function setBinding(action, code) {
    const conflict = Object.entries(settings.bindings).find(([otherAction, otherCode]) => otherAction !== action && otherCode === code);
    if (conflict) {
      toast(`${keyName(code)} BEREITS FÜR ${BINDING_LABELS[conflict[0]]}`);
      return false;
    }
    settings.bindings[action] = code;
    rebindingAction = null;
    updateBindingButtons();
    toast(`${BINDING_LABELS[action]} // ${keyName(code)}`);
    return true;
  }

  function recordPerformance(rawDt) {
    if (!performanceStats || (state !== "playing" && state !== "cinematic")) return;
    if (performanceStats.warmup > 0) {
      performanceStats.warmup -= rawDt;
      return;
    }
    const phase = performanceStats.phases[Math.min(phaseIndex, performanceStats.phases.length - 1)];
    const frameFps = rawDt > 0 ? Math.min(240, 1 / rawDt) : 60;
    performanceStats.frameCount++;
    performanceStats.elapsed += rawDt;
    performanceStats.longFrames += rawDt > .034 ? 1 : 0;
    performanceStats.maxEnemies = Math.max(performanceStats.maxEnemies, enemies?.length || 0);
    performanceStats.maxEnemyShots = Math.max(performanceStats.maxEnemyShots, enemyShots?.length || 0);
    performanceStats.maxPlayerShots = Math.max(performanceStats.maxPlayerShots, shots?.length || 0);
    performanceStats.maxParticles = Math.max(performanceStats.maxParticles, particles?.length || 0);
    phase.frames++;
    phase.elapsed += rawDt;
    phase.longFrames += rawDt > .034 ? 1 : 0;
    phase.minFps = Math.min(phase.minFps, frameFps);
    phase.maxEnemies = Math.max(phase.maxEnemies, enemies?.length || 0);
    phase.maxEnemyShots = Math.max(phase.maxEnemyShots, enemyShots?.length || 0);
    phase.maxParticles = Math.max(phase.maxParticles, particles?.length || 0);

    if (performanceStats.elapsed >= 1) {
      const fps = performanceStats.frameCount / performanceStats.elapsed;
      performanceStats.fps = fps;
      performanceStats.minFps = Math.min(performanceStats.minFps, fps);
      const totalFrames = performanceStats.phases.reduce((sum, item) => sum + item.frames, 0);
      const totalTime = performanceStats.phases.reduce((sum, item) => sum + item.elapsed, 0);
      performanceStats.averageFps = totalTime ? totalFrames / totalTime : 60;
      performanceStats.slowSamples = fps < 48 ? performanceStats.slowSamples + 1 : Math.max(0, performanceStats.slowSamples - 1);
      performanceStats.frameCount = 0;
      performanceStats.elapsed = 0;
      if (!benchmarkMode && performanceStats.slowSamples >= 2 && runtimeEffects !== "low") {
        runtimeEffects = runtimeEffects === "high" ? "medium" : "low";
        performanceStats.qualityDrops++;
        performanceStats.slowSamples = 0;
        resize();
        toast(`PERFORMANCE MODE // ${runtimeEffects.toUpperCase()}`);
      }
    }
  }

  function performanceReport() {
    return {
      averageFps: Number(performanceStats.averageFps.toFixed(1)),
      minFps: Number(performanceStats.minFps.toFixed(1)),
      longFrames: performanceStats.longFrames,
      qualityDrops: performanceStats.qualityDrops,
      finalEffects: runtimeEffects,
      maxEnemies: performanceStats.maxEnemies,
      maxEnemyShots: performanceStats.maxEnemyShots,
      maxPlayerShots: performanceStats.maxPlayerShots,
      maxParticles: performanceStats.maxParticles,
      phases: performanceStats.phases.map(item => ({
        phase: item.phase,
        averageFps: Number((item.elapsed ? item.frames / item.elapsed : 0).toFixed(1)),
        minFps: Number(item.minFps.toFixed(1)),
        longFrames: item.longFrames,
        maxEnemies: item.maxEnemies,
        maxEnemyShots: item.maxEnemyShots,
        maxParticles: item.maxParticles
      }))
    };
  }

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    if (!audio) {
      audio = new AC();
      audioMaster = audio.createGain();
      audioSfx = audio.createGain();
      audioMusic = audio.createGain();
      audioVoice = audio.createGain();
      audioReverb = audio.createConvolver();
      audioDelay = audio.createDelay(.8);
      reverbSend = audio.createGain();
      delaySend = audio.createGain();
      const delayFeedback = audio.createGain();
      const reverbReturn = audio.createGain();
      const delayReturn = audio.createGain();
      const compressor = audio.createDynamicsCompressor();
      audioMaster.gain.value = .82;
      audioSfx.gain.value = settings.sfx / 100;
      audioMusic.gain.value = settings.music / 100;
      audioVoice.gain.value = settings.sfx / 100;
      reverbSend.gain.value = .26;
      delaySend.gain.value = .16;
      delayFeedback.gain.value = .28;
      reverbReturn.gain.value = .32;
      delayReturn.gain.value = .25;
      audioDelay.delayTime.value = .235;
      audioReverb.buffer = createImpulseResponse(1.7, 2.4);
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 5;
      compressor.attack.value = .003;
      compressor.release.value = .2;
      audioSfx.connect(audioMaster);
      audioMusic.connect(audioMaster);
      audioVoice.connect(audioMaster);
      reverbSend.connect(audioReverb).connect(reverbReturn).connect(audioMaster);
      delaySend.connect(audioDelay).connect(delayReturn).connect(audioMaster);
      audioDelay.connect(delayFeedback).connect(audioDelay);
      audioMaster.connect(compressor).connect(audio.destination);
      if (trailerMode && audio.createMediaStreamDestination) {
        trailerAudioDestination = audio.createMediaStreamDestination();
        audioMaster.connect(trailerAudioDestination);
      }
      noiseBuffer = createNoiseBuffer();
      loadAudioAssets();
    }
    if (audio.state === "running") return Promise.resolve(true);
    if (!audioUnlock) {
      audioUnlock = audio.resume()
        .then(() => audio.state === "running")
        .catch(() => false)
        .finally(() => { audioUnlock = null; });
    }
    return audioUnlock;
  }

  function tone(freq, duration = .08, type = "sawtooth", volume = .035, slide = 0) {
    initAudio().then(ready => {
      if (!ready || !audio || !audioMaster) return;
      playTone(freq, duration, type, volume, slide);
    });
  }

  function playTone(freq, duration, type, volume, slide) {
    const o = audio.createOscillator(), g = audio.createGain();
    const now = audio.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, now);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    g.gain.setValueAtTime(Math.max(.0001, volume * 1.8), now);
    g.gain.exponentialRampToValueAtTime(.0001, now + duration);
    o.connect(g).connect(audioSfx); o.start(now); o.stop(now + duration);
    disposeAudioOnEnd(o, o, g);
  }

  function disposeAudioOnEnd(source, ...nodes) {
    source.addEventListener("ended", () => {
      for (const node of nodes) {
        try { node.disconnect(); } catch {}
      }
    }, { once: true });
  }

  function createNoiseBuffer() {
    const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function loadAudioAssets() {
    if (assetsLoading || !audio) return assetsLoading;
    const files = {
      music: "assets/audio/synthwave-loop.wav",
      laser: "assets/audio/laser-dual.wav",
      explosion: "assets/audio/explosion-heavy.wav",
      boost: "assets/audio/boost-ignite.wav",
      complete: "assets/audio/mission-complete.wav",
      "control-launch": "assets/audio/voice/control-launch.wav",
      "control-weapons-free": "assets/audio/voice/control-weapons-free.wav",
      "nexus-warning": "assets/audio/voice/nexus-warning.wav",
      "archon-reveal": "assets/audio/voice/archon-reveal.wav",
      "control-escape": "assets/audio/voice/control-escape.wav",
      "control-finale": "assets/audio/voice/control-finale.wav"
    };
    assetsLoading = Promise.all(Object.entries(files).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio asset unavailable: ${url}`);
      assetBuffers[key] = await audio.decodeAudioData(await response.arrayBuffer());
    })).catch(() => {});
    return assetsLoading;
  }

  function playAsset(name, volume = 1, pan = 0, destination = audioSfx) {
    if (!audio || !assetBuffers[name]) return false;
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    const stereo = panNode(pan);
    source.buffer = assetBuffers[name];
    gain.gain.value = volume;
    source.connect(gain).connect(stereo).connect(destination);
    source.start();
    disposeAudioOnEnd(source, source, gain, stereo);
    return true;
  }

  function playVoice(name) {
    if (!audio || !audioVoice || !assetBuffers[name]) return 0;
    if (currentVoiceSource) {
      try { currentVoiceSource.stop(); } catch {}
    }
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = assetBuffers[name];
    gain.gain.value = .96;
    source.connect(gain).connect(audioVoice);
    currentVoiceSource = source;
    const duckedMusic = Math.min(settings.music / 100 * .34, .075);
    audioMusic?.gain.setTargetAtTime(duckedMusic, audio.currentTime, .06);
    source.addEventListener("ended", () => {
      if (currentVoiceSource === source) currentVoiceSource = null;
      if (audioMusic && audio && (state === "playing" || state === "cinematic")) {
        audioMusic.gain.setTargetAtTime(settings.music / 100, audio.currentTime, .32);
      }
    }, { once: true });
    source.start();
    disposeAudioOnEnd(source, source, gain);
    return source.buffer.duration;
  }

  function createImpulseResponse(seconds, decay) {
    const length = audio.sampleRate * seconds;
    const impulse = audio.createBuffer(2, length, audio.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function panNode(value) {
    if (!audio.createStereoPanner) return audio.createGain();
    const panner = audio.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, value));
    return panner;
  }

  function laserSound() {
    initAudio().then(ready => {
      if (!ready) return;
      playAsset("laser", .62);
      const now = audio.currentTime;
      for (const side of [-1, 1]) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const filter = audio.createBiquadFilter();
        const pan = panNode(side * .72);
        osc.type = "sawtooth";
        const shipPitch = selectedShipKey === "specter" ? 1.22 : selectedShipKey === "bulwark" ? .72 : 1;
        osc.frequency.setValueAtTime((980 + side * 70) * shipPitch, now);
        osc.frequency.exponentialRampToValueAtTime(125 * shipPitch, now + .14);
        filter.type = "bandpass"; filter.frequency.value = 1250; filter.Q.value = 1.8;
        gain.gain.setValueAtTime(.16, now);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .15);
        osc.connect(filter).connect(gain).connect(pan);
        pan.connect(audioSfx);
        pan.connect(delaySend);
        osc.start(now + (side > 0 ? .008 : 0)); osc.stop(now + .16);
        disposeAudioOnEnd(osc, osc, filter, gain, pan);
      }
    });
  }

  function enemyLaserSound(pan = 0, heavy = false) {
    initAudio().then(ready => {
      if (!ready) return;
      const now = audio.currentTime;
      if (now - lastEnemyLaserAt < .055) return;
      lastEnemyLaserAt = now;
      const osc = audio.createOscillator();
      const mod = audio.createOscillator();
      const modGain = audio.createGain();
      const gain = audio.createGain();
      const filter = audio.createBiquadFilter();
      const stereo = panNode(pan);
      osc.type = heavy ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(heavy ? 210 : 340, now);
      osc.frequency.exponentialRampToValueAtTime(heavy ? 62 : 145, now + .2);
      mod.frequency.value = heavy ? 38 : 56;
      modGain.gain.value = heavy ? 42 : 24;
      mod.connect(modGain).connect(osc.frequency);
      filter.type = "bandpass"; filter.frequency.value = heavy ? 520 : 850; filter.Q.value = 1.2;
      gain.gain.setValueAtTime(heavy ? .13 : .075, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .22);
      osc.connect(filter).connect(gain).connect(stereo);
      stereo.connect(audioSfx); stereo.connect(reverbSend);
      osc.start(now); mod.start(now); osc.stop(now + .23); mod.stop(now + .23);
      disposeAudioOnEnd(osc, osc, mod, modGain, filter, gain, stereo);
    });
  }

  function explosionSound(power = 1, pan = 0) {
    initAudio().then(ready => {
      if (!ready || !noiseBuffer) return;
      playAsset("explosion", Math.min(.9, .25 + power * .16), pan);
      const now = audio.currentTime;
      const duration = Math.min(1.5, .32 + power * .22);
      const output = panNode(pan);
      const noise = audio.createBufferSource();
      const noiseGain = audio.createGain();
      const lowpass = audio.createBiquadFilter();
      noise.buffer = noiseBuffer;
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(1800, now);
      lowpass.frequency.exponentialRampToValueAtTime(90, now + duration);
      noiseGain.gain.setValueAtTime(Math.min(.5, .13 + power * .09), now);
      noiseGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      noise.connect(lowpass).connect(noiseGain).connect(output);

      const bass = audio.createOscillator();
      const bassGain = audio.createGain();
      bass.type = "sine";
      bass.frequency.setValueAtTime(105 - Math.min(35, power * 9), now);
      bass.frequency.exponentialRampToValueAtTime(28, now + duration);
      bassGain.gain.setValueAtTime(Math.min(.55, .16 + power * .1), now);
      bassGain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      bass.connect(bassGain).connect(output);
      output.connect(audioSfx);
      output.connect(reverbSend);
      noise.start(now); noise.stop(now + duration);
      bass.start(now); bass.stop(now + duration);
      disposeAudioOnEnd(noise, noise, noiseGain, lowpass);
      disposeAudioOnEnd(bass, bass, bassGain, output);
    });
  }

  function impactSound() {
    tone(720, .045, "square", .045, -360);
    tone(1180, .028, "sine", .025, -300);
    noiseBurst(.035, .055, 2800, 0);
  }

  function noiseBurst(duration, volume, frequency, pan = 0, destination = audioSfx) {
    if (!audio || !noiseBuffer) return;
    const now = audio.currentTime;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const stereo = panNode(pan);
    source.buffer = noiseBuffer;
    filter.type = "bandpass"; filter.frequency.value = frequency; filter.Q.value = .8;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(gain).connect(stereo).connect(destination);
    source.start(now); source.stop(now + duration);
    disposeAudioOnEnd(source, source, filter, gain, stereo);
  }

  function lockSound(acquired) {
    const now = performance.now();
    if (now - lastLockSoundAt < 180) return;
    lastLockSoundAt = now;
    if (acquired) {
      tone(880, .055, "square", .035, 180);
      setTimeout(() => tone(1320, .07, "square", .035, 120), 65);
    } else {
      tone(420, .05, "square", .018, -90);
    }
  }

  function pickupSound() {
    [440, 660, 880, 1320].forEach((freq, i) => {
      setTimeout(() => tone(freq, .14, "sine", .035, 80), i * 55);
    });
  }

  function warningSound() {
    tone(190, .14, "square", .055, -20);
    setTimeout(() => tone(150, .18, "square", .05, -15), 170);
  }

  function shieldSound() {
    initAudio().then(ready => {
      if (!ready) return;
      const now = audio.currentTime;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const filter = audio.createBiquadFilter();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(75, now);
      osc.frequency.exponentialRampToValueAtTime(1450, now + .48);
      filter.type = "lowpass"; filter.frequency.value = 2400;
      gain.gain.setValueAtTime(.12, now);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .52);
      osc.connect(filter).connect(gain).connect(audioSfx);
      osc.start(now); osc.stop(now + .54);
    });
  }

  function startAudioScene() {
    initAudio().then(ready => {
      if (!ready) return;
      if (!engineOsc) {
        engineOsc = audio.createOscillator();
        engineGain = audio.createGain();
        const filter = audio.createBiquadFilter();
        engineOsc.type = "sawtooth";
        engineOsc.frequency.value = 48;
        filter.type = "lowpass"; filter.frequency.value = 180;
        engineGain.gain.value = .025;
        engineOsc.connect(filter).connect(engineGain).connect(audioSfx);
        engineOsc.start();
        engineNoise = audio.createBufferSource();
        engineNoiseGain = audio.createGain();
        const noiseFilter = audio.createBiquadFilter();
        engineNoise.buffer = noiseBuffer;
        engineNoise.loop = true;
        noiseFilter.type = "bandpass"; noiseFilter.frequency.value = 110; noiseFilter.Q.value = .7;
        engineNoiseGain.gain.value = .018;
        engineNoise.connect(noiseFilter).connect(engineNoiseGain).connect(audioSfx);
        engineNoise.start();
      }
      if (!musicClock) {
        if (assetBuffers.music) {
          musicAssetSource = audio.createBufferSource();
          const bedGain = audio.createGain();
          musicAssetSource.buffer = assetBuffers.music;
          musicAssetSource.loop = true;
          bedGain.gain.value = .42;
          musicAssetSource.connect(bedGain).connect(audioMusic);
          musicAssetSource.start();
        }
        nextBeat = audio.currentTime + .05;
        beatStep = 0;
        musicClock = setInterval(scheduleMusic, 80);
      }
    });
  }

  function stopAudioScene() {
    if (musicClock) { clearInterval(musicClock); musicClock = null; }
    if (currentVoiceSource) {
      try { currentVoiceSource.stop(); } catch {}
      currentVoiceSource = null;
    }
    if (audioMusic && audio) audioMusic.gain.setTargetAtTime(.0001, audio.currentTime, .08);
    if (engineGain && audio) engineGain.gain.setTargetAtTime(.0001, audio.currentTime, .08);
    if (engineNoiseGain && audio) engineNoiseGain.gain.setTargetAtTime(.0001, audio.currentTime, .08);
    if (musicAssetSource) {
      try { musicAssetSource.stop(); } catch {}
      musicAssetSource = null;
    }
  }

  function scheduleMusic() {
    if (!audio || audio.state !== "running" || state !== "playing") return;
    const bpm = phaseIndex === 4 ? 164 : phaseIndex === 3 ? 146 : 126;
    const stepLength = 60 / bpm / 4;
    const roots = [55, 55, 65.41, 49];
    const arp = [1, 1.5, 2, 3, 2, 1.5, 2, 4];
    while (nextBeat < audio.currentTime + .18) {
      const root = roots[Math.floor(beatStep / 16) % roots.length];
      if (beatStep % 4 === 0) musicNote(root, nextBeat, stepLength * 3.4, "sawtooth", .075);
      if (beatStep % 4 === 0 || (phaseIndex >= 3 && beatStep % 8 === 6)) kick(nextBeat);
      if (beatStep % 8 === 4) snare(nextBeat);
      hat(nextBeat, beatStep % 2 === 0 ? .035 : .022);
      if (phaseIndex > 0 || beatStep % 2 === 0) {
        musicNote(root * arp[beatStep % arp.length] * 4, nextBeat, stepLength * .72, "square", phaseIndex >= 3 ? .024 : .014, true);
      }
      nextBeat += stepLength;
      beatStep++;
    }
  }

  function musicNote(freq, when, duration, type, volume, echo = false) {
    const osc = audio.createOscillator(), gain = audio.createGain(), filter = audio.createBiquadFilter();
    osc.type = type; osc.frequency.setValueAtTime(freq, when);
    filter.type = "lowpass"; filter.frequency.value = phaseIndex === 4 ? 1200 : 650;
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(filter).connect(gain).connect(audioMusic);
    if (echo) gain.connect(delaySend);
    osc.start(when); osc.stop(when + duration);
    disposeAudioOnEnd(osc, osc, filter, gain);
  }

  function kick(when) {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + .12);
    gain.gain.setValueAtTime(.15, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .16);
    osc.connect(gain).connect(audioMusic);
    osc.start(when); osc.stop(when + .17);
    disposeAudioOnEnd(osc, osc, gain);
  }

  function snare(when) {
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = "highpass"; filter.frequency.value = 1100;
    gain.gain.setValueAtTime(.085, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .12);
    source.connect(filter).connect(gain).connect(audioMusic);
    gain.connect(reverbSend);
    source.start(when); source.stop(when + .13);
    disposeAudioOnEnd(source, source, filter, gain);
  }

  function hat(when, volume) {
    const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
    source.buffer = noiseBuffer;
    filter.type = "highpass"; filter.frequency.value = 6500;
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .035);
    source.connect(filter).connect(gain).connect(audioMusic);
    source.start(when); source.stop(when + .04);
    disposeAudioOnEnd(source, source, filter, gain);
  }

  function updateEngineSound(boosted) {
    if (!audio || !engineOsc || !engineGain) return;
    const now = audio.currentTime;
    engineOsc.frequency.setTargetAtTime(boosted ? 92 : 48 + phaseIndex * 5, now, .06);
    engineGain.gain.setTargetAtTime(state === "playing" ? (boosted ? .075 : .028) : .0001, now, .06);
    if (engineNoiseGain) engineNoiseGain.gain.setTargetAtTime(state === "playing" ? (boosted ? .07 : .018) : .0001, now, .08);
    if (boosted !== boostSounding) {
      boostSounding = boosted;
      if (boosted) {
        playAsset("boost", .7);
        tone(68, .55, "sawtooth", .075, 620);
      }
    }
  }

  function showOnly(id) {
    [ui.menu, ui.briefing, ui.pause, ui.result, ui.leaderboard, ui.settings].forEach(el => el.classList.add("hidden"));
    if (id) id.classList.remove("hidden");
    document.body.classList.toggle("menu-visible", id === ui.menu);
    document.body.classList.toggle("briefing-visible", id === ui.briefing);
  }

  function startBriefing() {
    stopAudioScene();
    initAudio().then(soundReady => {
      toast(soundReady ? "AUDIO SYSTEM ONLINE" : "AUDIO BLOCKIERT");
    });
    resetGame(); state = "briefing"; briefingTimer = juryMode ? 3 : 5;
    showOnly(ui.briefing); ui.countdown.textContent = String(Math.ceil(briefingTimer)); ui.hud.classList.add("hidden");
    tone(440, .1, "square", .04);
  }

  function launch() {
    state = "playing"; showOnly(null); ui.hud.classList.remove("hidden");
    if (audioMusic && audio) audioMusic.gain.setTargetAtTime(settings.music / 100, audio.currentTime, .08);
    startAudioScene();
    status(juryMode ? "JURY RUN // VANGUARD // ACE" : "ENTERING OMEGA AIRSPACE", 2.2);
    tone(110, .8, "sawtooth", .08, 760);
    ui.tutorial.classList.remove("hidden");
    showTutorialStep();
    radio("CONTROL", "Flight link confirmed. Vanguard, you are cleared to engage.", "control-launch");
    if (trailerMode && !offlineTrailerMode) setTimeout(startTrailerRecording, 350);
  }

  function startTrailerRecording() {
    if (trailerRecording || !canvas.captureStream || typeof MediaRecorder === "undefined") return;
    const stream = canvas.captureStream(60);
    if (trailerAudioDestination) {
      for (const track of trailerAudioDestination.stream.getAudioTracks()) stream.addTrack(track);
    }
    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ].find(type => MediaRecorder.isTypeSupported(type)) || "";
    trailerChunks = [];
    trailerRecorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 12000000 } : undefined);
    trailerRecorder.ondataavailable = event => {
      if (event.data?.size) trailerChunks.push(event.data);
    };
    trailerRecorder.onstop = () => {
      const blob = new Blob(trailerChunks, { type: trailerRecorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "trench-runner-2086-trailer.webm";
      link.click();
      window.TR_TRAILER.complete = true;
      window.TR_TRAILER.bytes = blob.size;
      document.documentElement.dataset.trailer = "complete";
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    trailerClock = 0;
    trailerRecording = true;
    trailerRecorder.start(1000);
  }

  function pauseGame() {
    if (state === "playing") {
      state = "paused"; showOnly(ui.pause);
      if (audioMusic && audio) audioMusic.gain.setTargetAtTime(.035, audio.currentTime, .08);
    } else if (state === "paused") {
      state = "playing"; showOnly(null);
      nextBeat = audio ? audio.currentTime + .05 : 0;
      if (audioMusic && audio) audioMusic.gain.setTargetAtTime(settings.music / 100, audio.currentTime, .08);
    }
  }

  function quitGame() {
    stopAudioScene();
    state = "menu"; showOnly(ui.menu); ui.hud.classList.add("hidden");
  }

  function status(text, seconds = 1.5) {
    ui.status.textContent = text; ui.status.style.opacity = 1;
    clearTimeout(status.t); status.t = setTimeout(() => ui.status.style.opacity = 0, seconds * 1000);
  }

  function showMissionBeat(kicker, title, text, seconds = 1.8) {
    ui.missionBeatKicker.textContent = kicker;
    ui.missionBeatTitle.textContent = title;
    ui.missionBeatText.textContent = text;
    ui.missionBeat.classList.add("show");
    clearTimeout(showMissionBeat.t);
    showMissionBeat.t = setTimeout(() => ui.missionBeat.classList.remove("show"), seconds * 1000);
  }

  function toast(text) {
    ui.toast.textContent = text; ui.toast.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => ui.toast.classList.remove("show"), 1300);
  }

  function radio(speaker, text, voice = null) {
    if (benchmarkMode || offlineTrailerMode) voice = null;
    radioQueue.push({ speaker, text, voice });
    if (!radioBusy) playNextRadio();
  }

  function playNextRadio() {
    const message = radioQueue.shift();
    if (!message) { radioBusy = false; return; }
    radioBusy = true;
    ui.radioSpeaker.textContent = message.speaker;
    ui.radioText.textContent = message.text;
    if (settings.subtitles) ui.radio.classList.add("show");
    tone(520, .045, "square", .025, 120);
    const voiceDuration = message.voice ? playVoice(message.voice) * 1000 : 0;
    const duration = voiceDuration
      ? Math.max(2200, voiceDuration + 320)
      : Math.max(2200, Math.min(4800, message.text.length * 54));
    setTimeout(() => {
      ui.radio.classList.remove("show");
      setTimeout(() => { radioBusy = false; playNextRadio(); }, 220);
    }, duration);
  }

  const TUTORIAL = [
    { title: "MOVE", text: () => `${keyName(settings.bindings.up)} ${keyName(settings.bindings.left)} ${keyName(settings.bindings.down)} ${keyName(settings.bindings.right)}`, target: 1.2 },
    { title: "FIRE", text: () => `${keyName(settings.bindings.fire)} / RIGHT TRIGGER`, target: 1 },
    { title: "BOOST", text: () => `${keyName(settings.bindings.boost)} / RB`, target: .8 },
    { title: "SHIELD PULSE", text: () => `${keyName(settings.bindings.shield)} / LB`, target: 1 },
    { title: "VECTOR MODE", text: () => keyName(settings.bindings.vector), target: 1 }
  ];

  function showTutorialStep() {
    const step = TUTORIAL[tutorialStep];
    if (!step) {
      tutorialDone = true;
      telemetry.tutorialCompletedAt = Number(gameTime.toFixed(2));
      ui.tutorial.classList.add("hidden");
      awardScore(750); toast("TRAINING COMPLETE +750");
      radio("CONTROL", "Training complete. Weapons free.", "control-weapons-free");
      return;
    }
    tutorialProgress = 0;
    ui.tutorialTitle.textContent = step.title;
    ui.tutorialText.textContent = typeof step.text === "function" ? step.text() : step.text;
    ui.tutorial.style.setProperty("--tutorial-progress", "0%");
  }

  function advanceTutorial(amount) {
    if (tutorialDone || phaseIndex > 0) return;
    const step = TUTORIAL[tutorialStep];
    if (!step) return;
    tutorialProgress = Math.min(step.target, tutorialProgress + amount);
    ui.tutorial.style.setProperty("--tutorial-progress", `${tutorialProgress / step.target * 100}%`);
    if (tutorialProgress >= step.target) {
      tutorialStep++;
      tone(880, .12, "sine", .035, 220);
      setTimeout(showTutorialStep, 180);
    }
  }

  function selectShip(key, announce = true) {
    if (!SHIPS[key]) return;
    selectedShipKey = key;
    selectedShip = SHIPS[key];
    localStorage.setItem("trenchRunnerShip", key);
    document.querySelectorAll(".ship-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.ship === key);
    });
    $("#selectedShipRole").textContent = selectedShip.role;
    if (announce) {
      tone(key === "specter" ? 760 : key === "bulwark" ? 190 : 440, .18, "sawtooth", .04, 160);
      toast(`${selectedShip.name} SELECTED`);
    }
  }

  function selectDifficulty(key, announce = true) {
    if (!DIFFICULTIES[key]) return;
    selectedDifficultyKey = key;
    selectedDifficulty = DIFFICULTIES[key];
    localStorage.setItem("trenchRunnerDifficulty", key);
    document.querySelectorAll(".difficulty-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.difficulty === key);
    });
    if (announce) {
      tone(key === "nightmare" ? 130 : key === "cadet" ? 620 : 360, .2, "square", .04, key === "nightmare" ? -50 : 100);
      toast(`${selectedDifficulty.name} // SCORE x${selectedDifficulty.score.toFixed(1)}`);
    }
  }

  function openSettings() {
    $("#musicVolume").value = settings.music;
    $("#sfxVolume").value = settings.sfx;
    $("#sensitivity").value = settings.sensitivity;
    $("#effectsQuality").value = settings.effects;
    $("#subtitlesEnabled").value = String(settings.subtitles);
    $("#colorVisionMode").value = settings.colorVision;
    $("#reducedMotion").value = String(settings.reducedMotion);
    updateBindingButtons();
    updateSettingsLabels();
    showOnly(ui.settings);
  }

  function updateSettingsLabels() {
    $("#musicVolumeValue").textContent = $("#musicVolume").value;
    $("#sfxVolumeValue").textContent = $("#sfxVolume").value;
    $("#sensitivityValue").textContent = $("#sensitivity").value;
  }

  function applySettings() {
    rebindingAction = null;
    updateBindingButtons();
    settings.music = Number($("#musicVolume").value);
    settings.sfx = Number($("#sfxVolume").value);
    settings.sensitivity = Number($("#sensitivity").value);
    settings.effects = $("#effectsQuality").value;
    settings.subtitles = $("#subtitlesEnabled").value === "true";
    settings.colorVision = $("#colorVisionMode").value;
    settings.reducedMotion = $("#reducedMotion").value === "true";
    localStorage.setItem("trenchRunnerSettings", JSON.stringify(settings));
    if (audioMusic && audio) audioMusic.gain.setTargetAtTime(settings.music / 100, audio.currentTime, .04);
    if (audioSfx && audio) audioSfx.gain.setTargetAtTime(settings.sfx / 100, audio.currentTime, .04);
    if (audioVoice && audio) audioVoice.gain.setTargetAtTime(settings.sfx / 100, audio.currentTime, .04);
    document.body.classList.toggle("reduced-effects", settings.effects === "low");
    applyAccessibilitySettings();
    showOnly(ui.menu);
    toast("SETTINGS SAVED");
  }

  function awardScore(points) {
    const awarded = points * selectedDifficulty.score;
    score += awarded;
    return awarded;
  }

  function setPhase(index) {
    phaseIndex = index; phaseTime = 0;
    scriptedBeat = 0;
    telemetry.phases.push({ phase: PHASES[index].name, reachedAt: Number(gameTime.toFixed(2)) });
    const p = PHASES[index];
    ui.phase.textContent = index === 0 ? `${p.name} // ${selectedDifficulty.name}` : p.name;
    status(index === 4 ? "CORE DESTABILISIERT // FLIEH!" : `PHASE ${index + 1} // ${p.name}`, 2.4);
    tone(index === 4 ? 820 : 260, .65, "square", .07, index === 4 ? -610 : 420);
    if (index === 3 || index === 4) warningSound();
    if (index === 1) {
      if (!tutorialDone) {
        tutorialDone = true;
        ui.tutorial.classList.add("hidden");
      }
      radio("CONTROL", "Trench entry confirmed. Keep moving and break the defense formations.");
      showMissionBeat("PHASE TWO", "ENTER THE SCAR", "THE WALLS ARE CLOSING");
    }
    if (index === 2) {
      radio("NEXUS INTERCEPT", "Unauthorized craft detected. Core defenses active.", "nexus-warning");
      showMissionBeat("NEXUS DEFENSE GRID", "NO WAY BACK", "PUNCH THROUGH THE CORE ACCESS");
    }
    if (index === 4) radio("CONTROL", "Core collapse confirmed. Full boost. Get out now.", "control-escape");
    if (index === 3) {
      enemies = [];
      enemyShots = [];
      spawnBoss();
    }
    if (index === 4) {
      boss = null; ui.bossHud.classList.add("hidden"); escapeStarted = true;
      escapeBonus = 0; escapeWarningSecond = -1; collapsePulse = 1;
      ui.escapeHud.classList.remove("hidden");
      for (let i = 0; i < 14; i++) {
        explosion((Math.random() - .5) * W, (Math.random() - .5) * H, "#ff7435", .55 + Math.random() * .65, false);
      }
      explosionSound(3, 0);
    }
  }

  function spawnEnemy(type, x = null, y = null, pattern = null) {
    const margin = phaseIndex > 1 ? .52 : .75;
    const e = {
      type, x: x ?? (Math.random() * 2 - 1) * margin, y: y ?? (Math.random() * 2 - 1) * margin * .65,
      z: 1.25, vx: 0, vy: 0, fire: 1 + Math.random() * 2, phase: Math.random() * 6,
      pattern: pattern || ["sine", "weave", "dive"][Math.floor(Math.random() * 3)],
      hitFlash: 0, roll: 0,
      hp: type === "hunter" ? 3 : type === "turret" ? 4 : 1,
      maxHp: type === "hunter" ? 3 : type === "turret" ? 4 : 1
    };
    enemies.push(e);
  }

  function spawnWave() {
    const margin = phaseIndex > 1 ? .46 : .66;
    const count = Math.min(4, 2 + phaseIndex + (selectedDifficultyKey === "nightmare" ? 1 : 0));
    const pattern = ["sine", "weave", "dive"][waveIndex % 3];
    const centerX = (Math.random() * 2 - 1) * margin * .55;
    const centerY = (Math.random() * 2 - 1) * margin * .35;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * .13;
      const type = phaseIndex === 0 || i % 2 === 0 ? "scout" : "hunter";
      spawnEnemy(type, centerX + offset, centerY + Math.abs(offset) * .25, pattern);
    }
    waveIndex++;
    status(`WAVE ${String(waveIndex).padStart(2, "0")} // ${pattern.toUpperCase()}`, .9);
  }

  const SCRIPTED_WAVES = [
    [
      { at: 1.1, formation: "vanguard", title: "FIRST CONTACT" },
      { at: 5.2, formation: "crossfire", title: "BREAK THE LINE" },
      { at: 10.4, formation: "dive", title: "INCOMING FAST" },
      { at: 14.6, formation: "vanguard", title: "CLEAR THE APPROACH" }
    ],
    [
      { at: 1.4, formation: "crossfire", title: "TRENCH AMBUSH" },
      { at: 6.2, formation: "dive", title: "HUNTERS ON YOUR SIX" },
      { at: 11.1, formation: "wall", title: "DEFENSE WALL" },
      { at: 16.4, formation: "crossfire", title: "THREAD THE NEEDLE" },
      { at: 21.0, formation: "dive", title: "LAST LINE" }
    ],
    [
      { at: 1.0, formation: "wall", title: "CORE GUARD" },
      { at: 5.6, formation: "crossfire", title: "CROSSING FIRE" },
      { at: 10.2, formation: "dive", title: "NEXUS COUNTERSTRIKE" },
      { at: 15.0, formation: "wall", title: "BREACH THE CHAMBER" }
    ]
  ];

  function spawnScriptedFormation(kind) {
    const layouts = {
      vanguard: [[-.28, -.08], [0, .05], [.28, -.08]],
      crossfire: [[-.48, -.2], [-.28, .16], [.28, .16], [.48, -.2]],
      dive: [[-.36, -.2], [-.18, -.08], [0, .04], [.18, -.08], [.36, -.2]],
      wall: [[-.42, -.2], [-.14, .16], [.14, -.16], [.42, .2]]
    };
    const pattern = kind === "crossfire" ? "weave" : kind === "dive" ? "dive" : "sine";
    const layout = layouts[kind] || layouts.vanguard;
    layout.forEach(([x, y], i) => {
      const heavy = phaseIndex > 0 && (i % 2 || kind === "wall");
      spawnEnemy(heavy ? "hunter" : "scout", x, y, pattern);
    });
    if (kind === "wall" && phaseIndex > 0) {
      spawnEnemy("turret", -.5, .25, "sine");
      spawnEnemy("turret", .5, -.25, "sine");
    }
    waveIndex++;
  }

  function updateScriptedWaves() {
    const sequence = SCRIPTED_WAVES[phaseIndex];
    if (!sequence) return;
    while (scriptedBeat < sequence.length && phaseTime >= sequence[scriptedBeat].at) {
      const beat = sequence[scriptedBeat++];
      spawnScriptedFormation(beat.formation);
      showMissionBeat(`WAVE ${String(waveIndex).padStart(2, "0")}`, beat.title, "WEAPONS FREE", 1.25);
      tone(310, .15, "square", .035, 190);
    }
  }

  function spawnBoss() {
    boss = {
      x: 0, y: -.08, z: 1.35, hp: 100, maxHp: 160, fire: 1, phase: 0, intro: 2.8,
      stage: 0, coreOpen: false, rage: false, superAttack: 0, superVolley: 0,
      nodes: [
        { angle: -Math.PI / 2, hp: 20, maxHp: 20 },
        { angle: Math.PI / 6, hp: 20, maxHp: 20 },
        { angle: Math.PI * 5 / 6, hp: 20, maxHp: 20 }
      ]
    };
    ui.bossLabel.textContent = "CORE GUARDIAN // SHIELD NODES 3";
    ui.bossHud.classList.remove("hidden");
    status("CORE GUARDIAN INBOUND", 2.4);
    showMissionBeat("CLASS OMEGA ENTITY", "THE ARCHON", "SEVER ITS THREE CROWN NODES", 2.8);
    radio("ARCHON", "You crossed a graveyard to reach me. Now join it.", "archon-reveal");
    warningSound();
  }

  function bossNodePosition(node) {
    const angle = node.angle + boss.phase * .36;
    return {
      x: boss.x + Math.cos(angle) * .205,
      y: boss.y + Math.sin(angle) * .145
    };
  }

  function bossRemainingHealth() {
    return boss.hp + boss.nodes.reduce((total, node) => total + Math.max(0, node.hp), 0);
  }

  function updateBossStage() {
    const alive = boss.nodes.filter(node => node.hp > 0).length;
    const stage = 3 - alive;
    if (stage !== boss.stage) {
      boss.stage = stage;
      boss.fire = .25;
      shake = 10;
      explosionSound(1.2, 0);
      status(alive ? `SHIELD NODE DESTROYED // ${alive} REMAIN` : "SHIELD COLLAPSED // CORE EXPOSED", 2);
      radio("ARCHON", alive ? "You mistake damage for victory." : "Then witness the heart of Nexus.");
      warningSound();
    }
    boss.coreOpen = alive === 0;
    ui.bossLabel.textContent = boss.coreOpen ? "CORE GUARDIAN // CORE EXPOSED" : `CORE GUARDIAN // SHIELD NODES ${alive}`;
  }

  function firePlayer() {
    if (player.fire > 0) return;
    player.fire = .12 * selectedShip.fireRate;
    const double = player.double > 0;
    // Both wing cannons converge on the fixed cockpit crosshair.
    shots.push({ x: player.x, y: player.y, z: .05, life: 1, age: 0, side: -1 });
    shots.push({ x: player.x, y: player.y, z: .05, life: 1, age: 0, side: 1 });
    if (double) {
      shots.push({ x: player.x - .025, y: player.y, z: .05, life: 1, age: 0, side: -1, inner: true });
      shots.push({ x: player.x + .025, y: player.y, z: .05, life: 1, age: 0, side: 1, inner: true });
    }
    shotsFired += double ? 4 : 2;
    if (tutorialStep === 1) advanceTutorial(1);
    if (shots.length > 80) shots.splice(0, shots.length - 80);
    muzzleFlash = .075;
    laserSound();
  }

  function enemyFire(e, bossShot = false) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const n = Math.hypot(dx, dy) || 1;
    enemyShots.push({ x: e.x, y: e.y, z: e.z, vx: dx / n * .2, vy: dy / n * .2, speed: bossShot ? .56 : .42, boss: bossShot });
    enemyLaserSound(Math.max(-1, Math.min(1, (e.x - player.x) * 1.4)), bossShot);
  }

  function shieldPulse() {
    if (player.shield < 25 || player.pulse > 0) return;
    player.shield -= 25; player.pulse = 1.2; shake = 4;
    enemyShots = enemyShots.filter(s => {
      if (s.z < .5) { explosion(s.x * W * .3, s.y * H * .3, "#36f4ff", .4); return false; }
      return true;
    });
    shieldSound(); status("SHIELD IMPULSE", .8);
    if (tutorialStep === 3) advanceTutorial(1);
  }

  function damage(amount) {
    if (autoPilotMode) return;
    if (player.inv > 0) return;
    amount *= selectedShip.damageTaken * selectedDifficulty.damage;
    damageSustained += amount;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, amount);
      player.shield -= absorbed; amount -= absorbed;
    }
    player.hull -= amount; player.inv = .4; shake = 13; flash = .4; combo = 1;
    cameraKickX += (Math.random() - .5) * 12;
    cameraKickY += 5 + Math.random() * 6;
    hitStop = Math.max(hitStop, .035);
    explosionSound(.7, 0);
    if (player.hull <= 0) endGame(false);
  }

  function destroyEnemy(e, index) {
    const points = e.type === "hunter" ? 350 : e.type === "turret" ? 500 : 150;
    awardScore(points * combo); kills++; combo = Math.min(combo + 1, 9); maxCombo = Math.max(maxCombo, combo); comboTimer = 3;
    explosion(e.x * W * .34, e.y * H * .34, e.type === "turret" ? "#ff7b35" : "#36f4ff", .75);
    hitStop = Math.max(hitStop, e.type === "hunter" ? .022 : .014);
    cameraKickX -= e.x * 5;
    cameraKickY -= e.y * 4;
    enemies.splice(index, 1);
    if (Math.random() < .09) powerups.push({ x: e.x, y: e.y, z: e.z, type: ["shield", "repair", "double"][Math.floor(Math.random() * 3)], spin: 0 });
  }

  function explosion(x, y, color, power = 1, withSound = true) {
    const quality = effectsLevel() === "high" ? 1 : effectsLevel() === "medium" ? .62 : .32;
    for (let i = 0; i < 18 * power * quality; i++) {
      const a = Math.random() * Math.PI * 2, s = (30 + Math.random() * 180) * power;
      particles.push({ x: W / 2 + x, y: H / 2 + y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .25 + Math.random() * .6, max: 1, color, size: 1 + Math.random() * 4 * power });
    }
    const particleCap = effectsLevel() === "high" ? 280 : effectsLevel() === "medium" ? 180 : 100;
    if (particles.length > particleCap) particles.splice(0, particles.length - particleCap);
    shake = Math.max(shake, 6 * power);
    if (withSound) explosionSound(power, Math.max(-1, Math.min(1, x / (W * .4))));
  }

  function project(x, y, z) {
    const scale = 1 / Math.max(.12, z);
    // The crosshair is fixed in the cockpit. Moving the ship therefore shifts
    // the world around the camera, bringing the selected target to screen center.
    const cameraX = player?.x || 0;
    const cameraY = player?.y || 0;
    return {
      x: W / 2 + (x - cameraX) * W * .38 * scale,
      y: H / 2 + (y - cameraY) * H * .42 * scale,
      scale
    };
  }

  function update(dt) {
    if (state === "briefing") {
      briefingTimer -= dt; ui.countdown.textContent = Math.max(0, Math.ceil(briefingTimer));
      if (briefingTimer <= 0) launch();
      return;
    }
    if (state === "cinematic") {
      cinematicTime += dt;
      if (cinematicTime > 3.25 && !finaleCue) {
        finaleCue = 1;
        tone(329.63, 1.4, "sine", .035, 330);
      }
      if (cinematicTime > 4.15 && !finaleVoicePlayed) {
        finaleVoicePlayed = true;
        radio("CONTROL", "We hear you, pilot.", "control-finale");
      }
      updateParticles(dt);
      if (cinematicTime > 7.2) endGame(true);
      return;
    }
    if (state !== "playing") return;
    if (hitStop > 0) {
      hitStop -= dt;
      updateParticles(dt * .12);
      return;
    }

    gameTime += dt; phaseTime += dt;
    cameraKickX += (0 - cameraKickX) * Math.min(1, dt * 12);
    cameraKickY += (0 - cameraKickY) * Math.min(1, dt * 12);
    const p = PHASES[phaseIndex];
    if (juryMode && phaseIndex === 3 && boss && gameTime >= JURY_BOSS_DEADLINE && !juryBossAssist) {
      juryBossAssist = true;
      boss.nodes.forEach(node => { node.hp = 0; });
      boss.coreOpen = true;
      boss.stage = 3;
      boss.hp = 0;
      boss.dying = 1.65;
      boss.superAttack = 0;
      enemyShots = [];
      hitStop = .12;
      status("CORE CASCADE // JURY RUN SECURED", 1.7);
      radio("CONTROL", "Core collapse confirmed. Full boost. Get out now.");
      explosionSound(2.2, 0);
    }
    if (autoPilotMode) updateBenchmarkPilot(dt);
    if (trailerMode) vectorMode = trailerClock >= 20 && trailerClock < 25;
    const boostOn = (autoPilotMode && phaseIndex === 4 || actionPressed("boost") || gamepad().boost) && player.boost > 0;
    const speedFactor = selectedShip.speed * (boostOn ? 1.5 : 1);
    if (boostOn) player.boost = Math.max(0, player.boost - 28 * selectedShip.boostDrain * dt);
    else player.boost = Math.min(100, player.boost + 10 * dt);
    updateEngineSound(boostOn);
    if (tutorialStep === 2 && boostOn) advanceTutorial(dt);
    if (phaseIndex === 4) updateEscape(dt, boostOn);

    const gp = gamepad();
    const moveDown = actionPressed("down");
    const moveUp = actionPressed("up");
    const moveLeft = actionPressed("left");
    const moveRight = actionPressed("right");
    let ix = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0) + gp.x;
    let iy = (moveDown ? 1 : 0) - (moveUp ? 1 : 0) + gp.y;
    const inputLength = Math.hypot(ix, iy);
    if (inputLength > 1) { ix /= inputLength; iy /= inputLength; }
    if (tutorialStep === 0 && inputLength > .2) advanceTutorial(dt);
    const response = inputLength > 0 ? 14 : 9;
    const sensitivity = settings.sensitivity / 100;
    player.vx += (ix * 1.15 * selectedShip.move * sensitivity - player.vx) * Math.min(1, response * dt);
    player.vy += (iy * 1.15 * selectedShip.move * sensitivity - player.vy) * Math.min(1, response * dt);
    player.x += player.vx * dt; player.y += player.vy * dt;
    const boundX = .82 * p.width, boundY = .57 * p.width;
    if (Math.abs(player.x) > boundX || Math.abs(player.y) > boundY) {
      player.x = Math.max(-boundX, Math.min(boundX, player.x));
      player.y = Math.max(-boundY, Math.min(boundY, player.y));
      damage(12 * dt);
    }

    player.fire -= dt; player.inv -= dt; player.pulse -= dt;
    if (player.double > 0) player.double -= dt;
    if (actionPressed("fire") || gp.fire) firePlayer();
    if (gp.shield && !player.gpShield) shieldPulse();
    player.gpShield = gp.shield;

    if (phaseIndex < 3) {
      updateScriptedWaves();
      turretTimer -= dt;
      if (phaseIndex > 0 && selectedDifficultyKey === "nightmare" && turretTimer <= 0) {
        spawnEnemy("turret");
        turretTimer = (3.5 + Math.random() * 2) / selectedDifficulty.density;
      }
      if (phaseTime >= p.duration) setPhase(phaseIndex + 1);
    } else if (phaseIndex === 3 && boss && boss.hp <= 0 && boss.dying <= 0) {
      awardScore(10000); explosion(0, -H * .05, "#ff7b35", 3); setPhase(4);
    } else if (phaseIndex === 4 && phaseTime >= p.duration) startCompletionCinematic();

    updateEnemies(dt, speedFactor);
    updateTargeting();
    updateProjectiles(dt, speedFactor);
    updateParticles(dt);
    updatePowerups(dt, speedFactor);
    if (comboTimer > 0) comboTimer -= dt; else combo = 1;
    hitMarker = Math.max(0, hitMarker - dt);
    muzzleFlash = Math.max(0, muzzleFlash - dt);
    ui.crosshair.classList.toggle("locked", Boolean(currentTarget));
    ui.crosshair.classList.toggle("hit", hitMarker > 0);
    updateHud(p, boostOn);
  }

  function updateBenchmarkPilot(dt) {
    let target = null;
    if (boss) {
      const node = boss.nodes.find(item => item.hp > 0);
      if (node) {
        const position = bossNodePosition(node);
        target = { x: position.x, y: position.y };
      } else if (boss.coreOpen) {
        target = boss;
      }
    }
    if (!target && enemies.length) {
      target = enemies.reduce((best, enemy) => !best || enemy.z < best.z ? enemy : best, null);
    }
    if (target) {
      player.x += (target.x - player.x) * Math.min(1, dt * 8);
      player.y += (target.y - player.y) * Math.min(1, dt * 8);
      player.vx = 0;
      player.vy = 0;
      firePlayer();
    } else {
      player.x += (0 - player.x) * Math.min(1, dt * 4);
      player.y += (0 - player.y) * Math.min(1, dt * 4);
    }
  }

  function prepareCaptureScene(scene) {
    state = "playing";
    showOnly(null);
    ui.hud.classList.remove("hidden");
    tutorialDone = true;
    ui.tutorial.classList.add("hidden");
    radioQueue = [];
    ui.radio.classList.remove("show");

    if (scene === "formation" || scene === "vector") {
      vectorMode = scene === "vector";
      phaseIndex = scene === "vector" ? 1 : 0;
      phaseTime = scene === "vector" ? 12 : 6;
      ui.phase.textContent = PHASES[phaseIndex].name;
      spawnScriptedFormation(scene === "vector" ? "dive" : "crossfire");
      enemies.forEach((enemy, index) => {
        enemy.z = .43 + index * .065;
        enemy.fire = 99;
      });
      player.x = -.05;
      player.y = .03;
      firePlayer();
      updateTargeting();
    } else if (scene === "archon") {
      phaseIndex = 3;
      phaseTime = 4;
      spawnBoss();
      boss.intro = 0;
      boss.z = .82;
      boss.phase = 1.2;
      boss.fire = 99;
      ui.phase.textContent = "CORE GUARDIAN";
      ui.bossLabel.textContent = "THE ARCHON // CROWN NODES 3";
      updateTargeting();
    } else if (scene === "event-horizon") {
      phaseIndex = 3;
      phaseTime = 14;
      spawnBoss();
      boss.intro = 0;
      boss.z = .82;
      boss.phase = 3.1;
      boss.nodes.forEach(node => { node.hp = 0; });
      boss.stage = 3;
      boss.coreOpen = true;
      boss.rage = true;
      boss.hp = 28;
      boss.fire = 99;
      ui.phase.textContent = "CORE GUARDIAN";
      ui.bossLabel.textContent = "THE ARCHON // EVENT HORIZON";
      for (let a = -8; a <= 8; a++) {
        if (Math.abs(a - 1.2) < 2.2) continue;
        enemyShots.push({
          x: a * .105, y: Math.sin(a * 1.7 + boss.phase) * .32, z: .56 + (a % 3) * .035,
          vx: 0, vy: 0, speed: .5, boss: true
        });
      }
      updateTargeting();
    } else if (scene === "escape") {
      phaseIndex = 4;
      phaseTime = PHASES[4].duration - 3.4;
      escapeStarted = true;
      collapsePulse = .55;
      ui.phase.textContent = "ESCAPE";
      ui.escapeHud.classList.remove("hidden");
      ui.hud.classList.add("escape-danger");
      updateEscape(0, true);
      for (let i = 0; i < 80; i++) {
        particles.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - .5) * 45, vy: (Math.random() - .5) * 45,
          life: .7 + Math.random(), max: 1.7, color: i % 3 ? "#ff7b35" : "#ffffff",
          size: 2 + Math.random() * 6
        });
      }
    } else if (scene === "finale") {
      state = "cinematic";
      cinematicTime = 5.35;
      ui.hud.classList.add("hidden");
      for (let i = 0; i < 70; i++) {
        particles.push({
          x: W * .55 + (Math.random() - .5) * W * .5,
          y: H * .46 + (Math.random() - .5) * H * .35,
          vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30,
          life: 1, max: 1, color: i % 2 ? "#ff7b35" : "#36f4ff",
          size: 2 + Math.random() * 5
        });
      }
    }
    radioQueue = [];
    radioBusy = false;
    ui.radio.classList.remove("show");
    ui.missionBeat.classList.remove("show");
    if (state === "playing") state = "paused";
    document.documentElement.dataset.capture = scene;
  }

  function updateEscape(dt, boosted) {
    const remaining = Math.max(0, PHASES[4].duration - phaseTime);
    const second = Math.ceil(remaining);
    const bonusRate = boosted ? 320 : 35;
    const gained = bonusRate * dt;
    escapeBonus += awardScore(gained);
    collapsePulse = Math.max(0, collapsePulse - dt);
    if (second !== escapeWarningSecond) {
      escapeWarningSecond = second;
      if (second <= 5 && second > 0) {
        status(`DETONATION IN ${second}`, .75);
        warningSound();
        collapsePulse = .8;
      } else if (second === 10 || second === 15 || second === 20) {
        tone(240, .12, "square", .045, -60);
      }
    }
    ui.escapeCountdown.textContent = remaining.toFixed(1);
    ui.escapeBonus.textContent = `+${String(Math.floor(escapeBonus)).padStart(4, "0")}`;
    ui.escapeHud.classList.toggle("critical", remaining <= 5);
    ui.hud.classList.toggle("escape-danger", remaining <= 8);
  }

  function updateTargeting() {
    let best = null;
    let bestDistance = 62;
    for (const e of enemies) {
      if (e.z < .12 || e.z > 1.2) continue;
      const p = project(e.x, e.y, e.z);
      const distance = Math.hypot(p.x - W / 2, p.y - H / 2);
      if (distance < bestDistance) {
        best = e;
        bestDistance = distance;
      }
    }
    if (boss) {
      for (const node of boss.nodes) {
        if (node.hp <= 0) continue;
        const position = bossNodePosition(node);
        node.x = position.x; node.y = position.y; node.z = boss.z; node.bossNode = true;
        const p = project(node.x, node.y, node.z);
        const distance = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (distance < 72 && distance < bestDistance + 10) {
          best = node;
          bestDistance = distance;
        }
      }
      if (boss.coreOpen) {
        const p = project(boss.x, boss.y, boss.z);
        const distance = Math.hypot(p.x - W / 2, p.y - H / 2);
        if (distance < 88 && distance < bestDistance + 25) best = boss;
      }
    }
    previousTarget = currentTarget;
    currentTarget = best;
    if (!previousTarget && currentTarget) lockSound(true);
    else if (previousTarget && !currentTarget) lockSound(false);
  }

  function updateEnemies(dt, speedFactor) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i]; e.phase += dt; e.hitFlash = Math.max(0, e.hitFlash - dt * 7);
      e.z -= dt * (e.type === "turret" ? .14 : .22) * speedFactor;
      if (e.type !== "turret") {
        if (e.pattern === "sine") {
          e.x += Math.sin(e.phase * 2.4) * dt * .1;
          e.roll = Math.cos(e.phase * 2.4) * .32;
        } else if (e.pattern === "weave") {
          e.x += Math.sin(e.phase * 3.3) * dt * .075;
          e.y += Math.cos(e.phase * 2.1) * dt * .065;
          e.roll = Math.sin(e.phase * 3.3) * .45;
        } else {
          const dx = player.x - e.x, dy = player.y - e.y;
          e.x += dx * dt * .08;
          e.y += dy * dt * .08 + Math.sin(e.phase * 4) * dt * .035;
          e.roll = Math.sin(e.phase * 4) * .25;
        }
      }
      e.fire -= dt;
      if (e.fire <= 0 && e.z < .9 && e.z > .25 && e.type !== "scout") { enemyFire(e); e.fire = e.type === "turret" ? .8 : 1.5; }
      if (e.z <= .06) {
        if (Math.hypot(e.x - player.x, e.y - player.y) < .18) damage(e.type === "turret" ? 30 : 18);
        enemies.splice(i, 1);
      }
    }
    if (boss) {
      boss.phase += dt;
      if (boss.dying > 0) {
        boss.dying -= dt;
        boss.x *= .98; boss.y *= .98;
        shake = Math.max(shake, 5 + boss.dying * 4);
        if (Math.random() < dt * 7) {
          const x = boss.x + (Math.random() - .5) * .28;
          const y = boss.y + (Math.random() - .5) * .2;
          const p = project(x, y, boss.z);
          explosion(p.x - W / 2, p.y - H / 2, "#ff7b35", .5, false);
        }
        return;
      }
      if (boss.intro > 0) {
        boss.intro -= dt;
        boss.z += (.88 - boss.z) * Math.min(1, dt * 2.2);
        boss.fire = .8;
        if (boss.intro <= 0) {
          boss.z = .88;
          status("DESTROY SHIELD NODES", 1.8);
          tone(95, .7, "sawtooth", .08, 260);
        }
        ui.bossBar.style.width = `${Math.max(0, bossRemainingHealth() / boss.maxHp * 100)}%`;
        return;
      }
      boss.x = Math.sin(boss.phase * (.52 + boss.stage * .08)) * (.24 + boss.stage * .035);
      boss.y = -.08 + Math.sin(boss.phase * 1.15) * (.05 + boss.stage * .012);
      if (boss.coreOpen && boss.hp <= 35 && !boss.rage) {
        boss.rage = true;
        boss.superAttack = 2.4;
        enemyShots = [];
        showMissionBeat("FINAL PROTOCOL", "EVENT HORIZON", "FIND THE GAP", 2.2);
        radio("ARCHON", "If I fall, this world falls with me.");
        warningSound();
      }
      if (boss.superAttack > 0) {
        boss.superAttack -= dt;
        boss.superVolley -= dt;
        shake = Math.max(shake, 3);
        if (boss.superVolley <= 0 && enemyShots.length < 64) {
          boss.superVolley = .32;
          const gap = Math.sin(boss.phase * .8) * 1.1;
          for (let a = -8; a <= 8; a++) {
            if (Math.abs(a - gap * 5) < 2.2) continue;
            enemyShots.push({
              x: a * .105, y: Math.sin(a * 1.7 + boss.phase) * .32, z: .82,
              vx: 0, vy: 0, speed: .5, boss: true
            });
          }
        }
        ui.bossLabel.textContent = "THE ARCHON // EVENT HORIZON";
        return;
      }
      boss.fire -= dt;
      if (boss.fire <= 0) {
        const spread = boss.stage >= 2 ? 2 : 1;
        for (let a = -spread; a <= spread; a++) {
          const dx = player.x - boss.x + a * .13;
          const dy = player.y - boss.y;
          const length = Math.hypot(dx, dy) || 1;
          enemyShots.push({
            x: boss.x + a * .075, y: boss.y + .06, z: .76,
            vx: dx / length * .22, vy: dy / length * .22,
            speed: .46 + boss.stage * .035, boss: true
          });
        }
        if (boss.stage === 3) {
          for (let a = 0; a < 6; a++) {
            const angle = a / 6 * Math.PI * 2 + boss.phase;
            enemyShots.push({
              x: boss.x, y: boss.y, z: .72,
              vx: Math.cos(angle) * .16, vy: Math.sin(angle) * .16,
              speed: .42, boss: true
            });
          }
        }
        boss.fire = Math.max(.2, (.95 - boss.stage * .17 - (boss.rage ? .16 : 0)) * selectedDifficulty.bossFire);
        enemyLaserSound(Math.sin(boss.phase) * .5, true);
        if (enemyShots.length > 72) enemyShots.splice(0, enemyShots.length - 72);
      }
      ui.bossBar.style.width = `${Math.max(0, bossRemainingHealth() / boss.maxHp * 100)}%`;
    }
  }

  function updateProjectiles(dt, speedFactor) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.z += dt * 1.9; s.life -= dt; s.age += dt;
      let hit = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j], radius = e.type === "turret" ? .11 : .08;
        if (Math.abs(s.z - e.z) < .1 && Math.hypot(s.x - e.x, s.y - e.y) < radius) {
          e.hp--; e.hitFlash = 1; shotsHit++; hit = true; hitMarker = .14;
          if (e.hp <= 0) destroyEnemy(e, j); else impactSound();
          break;
        }
      }
      if (!hit && boss && s.z > .62 && s.z < .98) {
        for (const node of boss.nodes) {
          if (node.hp <= 0) continue;
          const position = bossNodePosition(node);
          if (Math.hypot(s.x - position.x, s.y - position.y) < .075) {
            node.hp--; shotsHit++; awardScore(25); hit = true; flash = .07; hitMarker = .14;
            impactSound();
            if (node.hp <= 0) {
              const p = project(position.x, position.y, boss.z);
              explosion(p.x - W / 2, p.y - H / 2, "#ff7b35", 1.15);
              awardScore(1000);
              updateBossStage();
            }
            break;
          }
        }
        if (!hit && boss.coreOpen && Math.hypot(s.x - boss.x, s.y - boss.y) < .105) {
          boss.hp--; shotsHit++; awardScore(30); hit = true; flash = .09; hitMarker = .14;
          hitStop = Math.max(hitStop, .018);
          cameraKickX += (Math.random() - .5) * 2.8;
          cameraKickY += (Math.random() - .5) * 2.2;
          impactSound();
          if (boss.hp <= 0 && !boss.dying) {
            boss.hp = 0;
            boss.dying = 1.65;
            enemyShots = [];
            hitStop = .12;
            status("CRITICAL HIT // CORE CASCADE", 1.7);
            radio("CONTROL", "Direct hit. Core collapse confirmed. Prepare to run.");
            explosionSound(2.2, 0);
          }
        } else if (!hit && Math.hypot(s.x - boss.x, s.y - boss.y) < .19) {
          hit = true;
          tone(210, .06, "square", .022, -40);
        }
      }
      if (hit || s.z > 1.4 || s.life <= 0) shots.splice(i, 1);
    }
    for (let i = enemyShots.length - 1; i >= 0; i--) {
      const s = enemyShots[i]; s.z -= dt * s.speed * speedFactor * selectedDifficulty.projectileSpeed; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.z < .1) {
        if (Math.hypot(s.x - player.x, s.y - player.y) < .11) damage(s.boss ? 18 : 11);
        enemyShots.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .97; p.vy *= .97; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    shake *= Math.pow(.04, dt); flash = Math.max(0, flash - dt);
  }

  function updatePowerups(dt, speedFactor) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i]; p.z -= dt * .2 * speedFactor; p.spin += dt * 3;
      if (p.z < .1) {
        if (Math.hypot(p.x - player.x, p.y - player.y) < .18) {
          if (p.type === "shield") player.shield = Math.min(player.maxShield, player.shield + 40);
          if (p.type === "repair") player.hull = Math.min(player.maxHull, player.hull + 30);
          if (p.type === "double") player.double = 12;
          awardScore(500); status(`${p.type.toUpperCase()} ACQUIRED`, 1); pickupSound();
        }
        powerups.splice(i, 1);
      }
    }
  }

  function updateHud(p, boosted) {
    ui.hullBar.style.width = `${Math.max(0, player.hull / player.maxHull * 100)}%`;
    ui.shieldBar.style.width = `${player.shield / player.maxShield * 100}%`; ui.boostBar.style.width = `${player.boost}%`;
    ui.hullText.textContent = Math.ceil(Math.max(0, player.hull));
    ui.shieldText.textContent = Math.ceil(player.shield); ui.boostText.textContent = Math.ceil(player.boost);
    ui.score.textContent = String(Math.floor(score)).padStart(6, "0");
    ui.speed.textContent = Math.floor(p.speed * selectedShip.speed * (boosted ? 1.5 : 1));
    ui.hostiles.textContent = String(enemies.length + (boss ? 1 : 0)).padStart(2, "0");
    const remaining = phaseIndex === 3 ? 0 : Math.max(0, p.duration - phaseTime);
    ui.timer.textContent = phaseIndex === 3 ? "BOSS" : `00:${String(Math.ceil(remaining)).padStart(2, "0")}`;
  }

  function gamepad() {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return { x: 0, y: 0, fire: false, boost: false, shield: false };
    const dead = v => Math.abs(v) < .15 ? 0 : v;
    return { x: dead(gp.axes[0] || 0), y: dead(gp.axes[1] || 0), fire: gp.buttons[7]?.pressed, boost: gp.buttons[5]?.pressed, shield: gp.buttons[4]?.pressed };
  }

  function draw() {
    ctx.save();
    const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
    const cameraMotion = settings.reducedMotion ? .12 : 1;
    ctx.translate((sx + cameraKickX) * cameraMotion, (sy + cameraKickY) * cameraMotion);
    drawBackground();
    if (state === "cinematic") {
      drawCompletionCinematic();
    } else if (state === "playing" || state === "paused" || state === "briefing") {
      drawMegastructure(); drawTunnel(); drawObjects(); drawCockpit();
      if (phaseIndex === 4) drawEscapeEffects();
    } else drawMenuWorld();
    ctx.restore();
    if (flash > 0) { ctx.fillStyle = `rgba(255,70,90,${flash * .45})`; ctx.fillRect(0, 0, W, H); }
    if (trailerMode) drawTrailerOverlay();
  }

  function drawTrailerOverlay() {
    const t = trailerClock;
    ctx.save();
    ctx.fillStyle = "rgba(2,4,12,.72)";
    ctx.fillRect(0, 0, W, H * .065);
    ctx.fillRect(0, H * .935, W, H * .065);
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.max(12, W * .008)}px Consolas, monospace`;
    ctx.fillStyle = "#36f4ff";
    ctx.fillText("TRENCH RUNNER 2086", W * .025, H * .042);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ff7b35";
    ctx.fillText(PHASES[phaseIndex]?.name || "OMEGA CORE ASSAULT", W * .975, H * .042);

    if (state === "playing" && t >= 4 && t < 54) {
      ctx.translate(W / 2, H / 2);
      ctx.strokeStyle = currentTarget ? "#ff7b35" : "#36f4ff";
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      const r = 35;
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(-12, 0);
      ctx.moveTo(r, 0); ctx.lineTo(12, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, -12);
      ctx.moveTo(0, r); ctx.lineTo(0, 12);
      ctx.stroke();
      ctx.translate(-W / 2, -H / 2);
    }

    if (t < 4) {
      ctx.fillStyle = `rgba(1,2,8,${Math.min(1, 1.4 - t * .12)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ff7b35";
      ctx.font = `700 ${Math.max(13, W * .011)}px Consolas, monospace`;
      ctx.fillText("NEXUS TRANSMISSION // PRIORITY OMEGA", W / 2, H * .42);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.max(36, W * .045)}px Impact, sans-serif`;
      ctx.fillText("THE CORE GOES ONLINE", W / 2, H * .52);
    } else if (t >= 20 && t < 25) {
      drawTrailerCaption("VECTOR MODE", "OLD SCHOOL. NEW WAR.");
    } else if (phaseIndex === 3 && boss?.intro > 0) {
      drawTrailerCaption("THE ARCHON", "SEVER THE CROWN NODES");
    } else if (phaseIndex === 4 && phaseTime < 2.5) {
      drawTrailerCaption("CORE COLLAPSE", "FULL BOOST // NO SECOND CHANCE");
    }

    if (t >= 54) {
      const alpha = Math.min(1, (t - 54) * .8);
      ctx.fillStyle = `rgba(1,2,8,${alpha})`;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.max(52, W * .064)}px Impact, sans-serif`;
      ctx.fillText("TRENCH RUNNER", W / 2, H * .43);
      ctx.fillStyle = "#36f4ff";
      ctx.font = `800 ${Math.max(35, W * .043)}px Impact, sans-serif`;
      ctx.fillText("2086", W / 2, H * .52);
      ctx.fillStyle = "#ff7b35";
      ctx.font = `700 ${Math.max(14, W * .012)}px Consolas, monospace`;
      ctx.fillText("BUILT WITH CODEX // ENTER THE SCAR", W / 2, H * .61);
    }
    ctx.restore();
  }

  function drawTrailerCaption(title, subtitle) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(2,4,14,.7)";
    ctx.fillRect(W * .25, H * .72, W * .5, H * .12);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(24, W * .029)}px Impact, sans-serif`;
    ctx.fillText(title, W / 2, H * .775);
    ctx.fillStyle = "#ff7b35";
    ctx.font = `700 ${Math.max(10, W * .009)}px Consolas, monospace`;
    ctx.fillText(subtitle, W / 2, H * .81);
  }

  function drawBackground() {
    const grad = ctx.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, W * .75);
    grad.addColorStop(0, vectorMode ? "#00110f" : "#101047");
    grad.addColorStop(.45, vectorMode ? "#000705" : "#090b25");
    grad.addColorStop(1, "#02040d");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    const speed = state === "playing" ? (PHASES[phaseIndex].speed / 700) : .2;
    for (const s of stars) {
      s.z -= .0025 * speed;
      if (s.z <= 0) { s.z = 1; s.x = Math.random() * W; s.y = Math.random() * H; }
      ctx.globalAlpha = .25 + (1 - s.z) * .75;
      ctx.fillStyle = vectorMode ? "#20ff96" : "#c9faff";
      const dx = (s.x - W / 2) * (1 - s.z) * .08 * speed, dy = (s.y - H / 2) * (1 - s.z) * .08 * speed;
      ctx.fillRect(s.x + dx, s.y + dy, s.s, s.s + Math.abs(dy) * .08);
    }
    ctx.globalAlpha = 1;
  }

  function drawMegastructure() {
    if (phaseIndex < 2) return;
    const danger = phaseIndex === 4 ? Math.min(1, phaseTime / PHASES[4].duration) : 0;
    const cx = W / 2 - player.x * W * .18;
    const cy = H * .46 - player.y * H * .2;
    const radius = Math.min(W, H) * (phaseIndex === 2 ? .4 : .48);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(gameTime * .018);
    ctx.strokeStyle = vectorMode ? "rgba(60,255,150,.26)" : `rgba(116,72,255,${.2 + danger * .12})`;
    ctx.lineWidth = 8;
    ctx.shadowColor = phaseIndex === 4 ? "#ff4b35" : "#8b46ff";
    ctx.shadowBlur = effectsLevel() === "low" ? 0 : 24;
    for (let ring = 0; ring < 3; ring++) {
      ctx.beginPath();
      const rr = radius * (1 - ring * .18);
      for (let i = 0; i < 32; i++) {
        if (phaseIndex === 4 && (i + ring * 3) % 7 < 2) continue;
        const a0 = i / 32 * Math.PI * 2;
        const a1 = a0 + Math.PI * 2 / 32 * .72;
        ctx.arc(0, 0, rr, a0, a1);
      }
      ctx.stroke();
    }
    ctx.rotate(-gameTime * .043);
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const fracture = phaseIndex === 4 ? danger * (20 + (i % 3) * 18) : 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * .23, Math.sin(a) * radius * .23);
      ctx.lineTo(Math.cos(a + fracture * .0008) * (radius + fracture), Math.sin(a + fracture * .0008) * (radius + fracture));
      ctx.stroke();
    }
    if (phaseIndex === 4) {
      for (let i = 0; i < 12; i++) {
        const a = i * 2.399 + gameTime * .04;
        const drift = radius * (.4 + danger * (i % 5) * .16);
        const x = Math.cos(a) * drift;
        const y = Math.sin(a) * drift;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + gameTime * (i % 2 ? .6 : -.45));
        ctx.fillStyle = i % 4 === 0 ? "rgba(255,92,45,.7)" : "rgba(22,18,52,.95)";
        ctx.strokeStyle = i % 4 === 0 ? "#ff7b35" : "#7b59ff";
        ctx.fillRect(-8 - i % 3 * 4, -3, 16 + i % 3 * 8, 6);
        ctx.strokeRect(-8 - i % 3 * 4, -3, 16 + i % 3 * 8, 6);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function tunnelPoint(z, side, vertical) {
    const p = PHASES[phaseIndex] || PHASES[0], wobble = Math.sin((gameTime + z * 5) * .32) * .04;
    const x = vertical ? side * p.width + wobble : side * p.width;
    const y = vertical ? side * .58 * p.width : side * .58 * p.width + wobble;
    return project(x, y, z);
  }

  function drawTunnel() {
    const color = vectorMode ? "#22ff88" : "#2578ff";
    ctx.lineWidth = vectorMode ? 1.2 : 1;
    for (let i = 1; i < 18; i++) {
      const z = ((i / 17 + gameTime * .22 * (state === "playing" ? 1 : .1)) % 1) * 1.15 + .12;
      const alpha = Math.max(0, 1 - z / 1.35) * .75;
      const p1 = project(-PHASES[phaseIndex].width, -.58 * PHASES[phaseIndex].width, z);
      const p2 = project(PHASES[phaseIndex].width, -.58 * PHASES[phaseIndex].width, z);
      const p3 = project(PHASES[phaseIndex].width, .58 * PHASES[phaseIndex].width, z);
      const p4 = project(-PHASES[phaseIndex].width, .58 * PHASES[phaseIndex].width, z);
      ctx.strokeStyle = hexAlpha(color, alpha); ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.stroke();
    }
    for (let s = -1; s <= 1; s += 2) {
      for (let j = -2; j <= 2; j++) {
        const near = project(s * PHASES[phaseIndex].width, j * .145 * PHASES[phaseIndex].width, .12);
        const far = project(s * PHASES[phaseIndex].width, j * .145 * PHASES[phaseIndex].width, 1.3);
        ctx.strokeStyle = hexAlpha(color, j === 0 ? .8 : .32); ctx.beginPath(); ctx.moveTo(near.x, near.y); ctx.lineTo(far.x, far.y); ctx.stroke();
      }
      for (let j = -3; j <= 3; j++) {
        const near = project(j * .25 * PHASES[phaseIndex].width, s * .58 * PHASES[phaseIndex].width, .12);
        const far = project(j * .25 * PHASES[phaseIndex].width, s * .58 * PHASES[phaseIndex].width, 1.3);
        ctx.strokeStyle = hexAlpha(color, .28); ctx.beginPath(); ctx.moveTo(near.x, near.y); ctx.lineTo(far.x, far.y); ctx.stroke();
      }
    }
    if (!vectorMode && effectsLevel() !== "low") {
      for (let i = 0; i < 9; i++) {
        const z = .2 + (i % 6) * .18;
        const side = i % 2 ? -1 : 1;
        const y = ((i % 3) - 1) * PHASES[phaseIndex].width * .22;
        const p = project(side * PHASES[phaseIndex].width * .96, y, z);
        const size = Math.max(2, 9 / z);
        ctx.fillStyle = i % 3 === 0 ? "rgba(255,123,53,.5)" : "rgba(54,244,255,.28)";
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
        ctx.fillRect(p.x - size / 2, p.y - size * 1.7, size, size * 3.4);
      }
      ctx.shadowBlur = 0;
    }
    if (phaseIndex === 4) {
      for (let i = 0; i < 5; i++) {
        const x = (Math.sin(gameTime * 3 + i * 8.2) * .8), y = (Math.cos(gameTime * 2 + i * 4.7) * .5), z = .2 + (i % 6) * .18;
        drawExplosionSprite(project(x, y, z), 18 + (1 / z) * 6);
      }
    }
  }

  function drawEscapeEffects() {
    const progress = Math.min(1, phaseTime / PHASES[4].duration);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(255,65,45,${.12 + progress * .3})`;
    ctx.lineWidth = 1 + progress * 2;
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2 + Math.sin(gameTime * .7) * .08;
      const inner = Math.min(W, H) * (.12 + (i % 3) * .025);
      const outer = Math.max(W, H) * (.6 + progress * .22);
      ctx.beginPath();
      ctx.moveTo(W / 2 + Math.cos(angle) * inner, H / 2 + Math.sin(angle) * inner);
      ctx.lineTo(W / 2 + Math.cos(angle + Math.sin(gameTime * 2 + i) * .025) * outer, H / 2 + Math.sin(angle) * outer);
      ctx.stroke();
    }
    if (collapsePulse > 0) {
      ctx.fillStyle = `rgba(255,110,45,${collapsePulse * .24})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function drawObjects() {
    for (const p of powerups) drawPowerup(p);
    for (const e of enemies) drawEnemy(e);
    if (boss) drawBoss();
    if (currentTarget) drawTargetLock(currentTarget);
    ctx.lineWidth = 2;
    for (const s of shots) {
      const target = project(s.x, s.y, s.z);
      const muzzleX = W / 2 + s.side * W * (s.inner ? .105 : .145);
      const muzzleY = H * (s.inner ? .82 : .86);
      const travel = Math.min(1, s.age / .16);
      const headX = muzzleX + (target.x - muzzleX) * travel;
      const headY = muzzleY + (target.y - muzzleY) * travel;
      const tailTravel = Math.max(0, travel - .28);
      const tailX = muzzleX + (target.x - muzzleX) * tailTravel;
      const tailY = muzzleY + (target.y - muzzleY) * tailTravel;
      ctx.strokeStyle = vectorMode ? "#55ff99" : selectedShip.laser;
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 16; ctx.lineWidth = s.inner ? 1.5 : 3;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY); ctx.stroke();
    }
    for (const s of enemyShots) {
      const p = project(s.x, s.y, s.z), r = Math.max(2, 7 / s.z);
      ctx.fillStyle = s.boss ? "#ff3d8d" : "#ff7b35"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawTargetLock(target) {
    const p = project(target.x, target.y, target.z);
    const size = target === boss ? 78 : Math.max(24, 34 / target.z);
    const gap = size * .55;
    const arm = Math.max(7, size * .22);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = hitMarker > 0 ? "#ffffff" : "#ff7b35";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-gap, -gap + arm); ctx.lineTo(-gap, -gap); ctx.lineTo(-gap + arm, -gap);
    ctx.moveTo(gap - arm, -gap); ctx.lineTo(gap, -gap); ctx.lineTo(gap, -gap + arm);
    ctx.moveTo(gap, gap - arm); ctx.lineTo(gap, gap); ctx.lineTo(gap - arm, gap);
    ctx.moveTo(-gap + arm, gap); ctx.lineTo(-gap, gap); ctx.lineTo(-gap, gap - arm);
    ctx.stroke();
    ctx.font = "10px Consolas, monospace";
    ctx.textAlign = "center";
    const lockLabel = target === boss ? "CORE LOCK" : target.bossNode ? "SHIELD NODE" : `LOCK ${Math.max(1, Math.round(target.z * 900))}M`;
    ctx.fillText(lockLabel, 0, gap + 18);
    ctx.restore();
  }

  function drawEnemy(e) {
    const p = project(e.x, e.y, e.z), r = Math.max(3, (e.type === "turret" ? 25 : 17) * p.scale);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(e.roll || 0);
    ctx.strokeStyle = vectorMode ? "#54ff99" : e.type === "turret" ? "#ff7b35" : "#a846ff";
    ctx.fillStyle = e.hitFlash > 0 ? `rgba(255,255,255,${.45 + e.hitFlash * .5})` : vectorMode ? "rgba(0,15,8,.65)" : "rgba(30,10,66,.8)";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = vectorMode || effectsLevel() === "low" ? 2 : 12; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (e.type === "turret") {
      ctx.rect(-r * .55, -r * .5, r * 1.1, r); ctx.moveTo(-r, r * .7); ctx.lineTo(0, r * .25); ctx.lineTo(r, r * .7);
    } else {
      ctx.moveTo(0, -r); ctx.lineTo(r * .9, r * .6); ctx.lineTo(r * .25, r * .35); ctx.lineTo(0, r); ctx.lineTo(-r * .25, r * .35); ctx.lineTo(-r * .9, r * .6); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    if (e.hp < e.maxHp) {
      ctx.strokeStyle = "#ff7b35";
      ctx.lineWidth = Math.max(1, r * .06);
      ctx.beginPath();
      ctx.moveTo(-r * .42, -r * .1); ctx.lineTo(r * .2, r * .34);
      ctx.moveTo(r * .35, -r * .25); ctx.lineTo(-r * .1, r * .5);
      ctx.stroke();
    }
    ctx.fillStyle = "#ff365c"; ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, r * .12), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBoss() {
    const p = project(boss.x, boss.y, boss.z), r = Math.min(W, H) * .16;
    ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = vectorMode ? "#54ff99" : "#ff477d"; ctx.fillStyle = boss.dying > 0 && Math.floor(boss.dying * 12) % 2 ? "rgba(255,255,255,.9)" : vectorMode ? "rgba(0,10,5,.8)" : "rgba(24,5,35,.88)";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = vectorMode || effectsLevel() === "low" ? 2 : 25; ctx.lineWidth = 2;
    ctx.rotate(Math.sin(boss.phase * .5) * .08);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, rr = i % 2 ? r * .7 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = boss.rage ? "#ff365c" : "#ff8aa9";
    ctx.lineWidth = 3;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * r * .24, -r * .52);
      ctx.lineTo(side * r * .42, -r * 1.18);
      ctx.lineTo(side * r * .08, -r * .72);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-r * .3, -r * .12);
    ctx.quadraticCurveTo(0, r * .08, r * .3, -r * .12);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .38, 0, Math.PI * 2); ctx.stroke();
    const pulse = .17 + Math.sin(gameTime * 8) * .04;
    ctx.fillStyle = boss.coreOpen ? "#ff7b35" : "#365cff";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = boss.coreOpen ? 30 : 14;
    ctx.beginPath(); ctx.arc(0, 0, r * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = boss.rage ? "#ffffff" : "#ff365c";
    ctx.shadowColor = boss.rage ? "#ff365c" : "#a846ff";
    ctx.shadowBlur = 24;
    ctx.fillRect(-r * .24, -r * .13, r * .48, Math.max(3, r * .035));
    if (!boss.coreOpen) {
      ctx.strokeStyle = "rgba(54,244,255,.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * .48, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    for (const node of boss.nodes) {
      if (node.hp <= 0) continue;
      const position = bossNodePosition(node);
      const n = project(position.x, position.y, boss.z);
      const nr = Math.max(9, r * .14);
      const health = node.hp / node.maxHp;
      const color = health > .5 ? "#36f4ff" : "#ff7b35";
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(gameTime * 1.8 + node.angle);
      ctx.strokeStyle = color;
      ctx.fillStyle = vectorMode ? "rgba(0,12,6,.9)" : "rgba(5,15,38,.92)";
      ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * Math.PI * 2;
        const x = Math.cos(angle) * nr, y = Math.sin(angle) * nr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(-gameTime * 3.6);
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = .45 + Math.sin(gameTime * 10 + node.angle) * .3;
      ctx.beginPath(); ctx.arc(0, 0, nr * .42, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPowerup(o) {
    const p = project(o.x, o.y, o.z), r = 12 * p.scale;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(o.spin); ctx.strokeStyle = o.type === "repair" ? "#61ff8a" : o.type === "double" ? "#ff7b35" : "#36f4ff";
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 15; ctx.strokeRect(-r, -r, r * 2, r * 2);
    ctx.rotate(-o.spin * 2); ctx.strokeRect(-r * .55, -r * .55, r * 1.1, r * 1.1); ctx.restore();
  }

  function drawExplosionSprite(p, r) {
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, "#fff"); g.addColorStop(.2, "#ffd05b"); g.addColorStop(.55, "#ff4d35"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawCockpit() {
    const cyan = vectorMode ? "#24ff87" : selectedShip.color;
    ctx.save(); ctx.strokeStyle = hexAlpha(cyan, .6); ctx.fillStyle = vectorMode ? "rgba(0,8,4,.85)" : "rgba(2,5,16,.9)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * .54); ctx.lineTo(W * .15, H * .72); ctx.lineTo(W * .32, H); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W, H * .54); ctx.lineTo(W * .85, H * .72); ctx.lineTo(W * .68, H); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * .31, H); ctx.lineTo(W * .38, H * .86); ctx.lineTo(W * .62, H * .86); ctx.lineTo(W * .69, H); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (selectedShipKey === "specter") {
      ctx.strokeStyle = hexAlpha(cyan, .5);
      ctx.beginPath(); ctx.moveTo(W * .32, H); ctx.lineTo(W * .46, H * .9); ctx.moveTo(W * .68, H); ctx.lineTo(W * .54, H * .9); ctx.stroke();
    } else if (selectedShipKey === "bulwark") {
      ctx.fillStyle = "rgba(255,155,66,.07)";
      ctx.strokeStyle = hexAlpha(cyan, .48);
      ctx.fillRect(W * .365, H * .895, W * .27, H * .105);
      ctx.strokeRect(W * .365, H * .895, W * .27, H * .105);
    }
    if (muzzleFlash > 0) {
      const alpha = muzzleFlash / .075;
      for (const side of [-1, 1]) {
        const x = W / 2 + side * W * .145, y = H * .86;
        const radius = 12 + alpha * 24;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, `rgba(255,255,255,${alpha})`);
        glow.addColorStop(.25, `rgba(54,244,255,${alpha * .9})`);
        glow.addColorStop(1, "rgba(54,244,255,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.strokeStyle = hexAlpha(cyan, .25); ctx.beginPath(); ctx.moveTo(W * .05, 0); ctx.lineTo(W * .17, H * .7); ctx.moveTo(W * .95, 0); ctx.lineTo(W * .83, H * .7); ctx.stroke();
    if (player?.pulse > 0) {
      ctx.strokeStyle = `rgba(54,244,255,${player.pulse / 1.2})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, (1.2 - player.pulse) * W * .65, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawMenuWorld() {
    const t = performance.now() / 1000;
    ctx.save(); ctx.translate(W * .73, H * .52); ctx.rotate(-.18);
    ctx.strokeStyle = vectorMode ? "#31ff8d" : "#36f4ff"; ctx.fillStyle = "rgba(13,20,55,.68)"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 18; ctx.lineWidth = 2;
    const s = Math.min(W, H) * .23;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * .72, s * .55); ctx.lineTo(s * .2, s * .35); ctx.lineTo(0, s * .82); ctx.lineTo(-s * .2, s * .35); ctx.lineTo(-s * .72, s * .55); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#a846ff"; ctx.beginPath(); ctx.moveTo(0, -s * .8); ctx.lineTo(0, s * .6); ctx.moveTo(-s * .55, s * .45); ctx.lineTo(s * .55, s * .45); ctx.stroke();
    ctx.fillStyle = "#ff7b35"; ctx.shadowColor = "#ff7b35"; ctx.beginPath(); ctx.arc(0, s * .54, 7 + Math.sin(t * 8) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function startCompletionCinematic() {
    if (state !== "playing") return;
    state = "cinematic";
    cinematicTime = 0;
    ui.hud.classList.add("hidden");
    ui.escapeHud.classList.add("hidden");
    ui.hud.classList.remove("escape-danger");
    enemyShots = [];
    shots = [];
    explosionSound(3.5, 0);
    playAsset("complete", .8, 0, audioMusic);
    tone(220, 1.8, "sine", .06, 660);
    if (audioMusic && audio) audioMusic.gain.setTargetAtTime(.025, audio.currentTime + 1.4, .7);
    if (engineGain && audio) engineGain.gain.setTargetAtTime(.006, audio.currentTime + 1.8, .8);
  }

  function drawCompletionCinematic() {
    const t = cinematicTime;
    const centerX = W * .66, centerY = H * .46;
    const blast = Math.min(1, t / 2.7);
    const fadeBlast = t > 3 ? Math.max(0, 1 - (t - 3) / 1.8) : 1;
    const radius = 35 + blast * Math.min(W, H) * .38;
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    glow.addColorStop(0, `rgba(255,255,255,${.98 * fadeBlast})`);
    glow.addColorStop(.12, `rgba(255,210,90,${.95 * fadeBlast})`);
    glow.addColorStop(.45, `rgba(255,65,35,${(.85 - blast * .25) * fadeBlast})`);
    glow.addColorStop(1, "rgba(80,15,90,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    if (t > 3.1) {
      const dawn = Math.min(1, (t - 3.1) / 2.6);
      const planetY = H * (1.12 - dawn * .12);
      const planetR = Math.max(W, H) * .62;
      const planet = ctx.createRadialGradient(W * .58, planetY - planetR * .55, 0, W * .58, planetY, planetR);
      planet.addColorStop(0, `rgba(88,220,255,${.35 * dawn})`);
      planet.addColorStop(.55, `rgba(22,50,118,${.72 * dawn})`);
      planet.addColorStop(1, "rgba(3,7,24,0)");
      ctx.fillStyle = planet;
      ctx.beginPath(); ctx.arc(W * .58, planetY, planetR, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(167,242,255,${.75 * dawn})`;
      ctx.shadowColor = "#36f4ff"; ctx.shadowBlur = 32;
      ctx.beginPath(); ctx.arc(W * .58, planetY, planetR, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const shipX = W * (.23 + Math.min(1, t / 5.2) * .2);
    const shipY = H * (.58 - Math.sin(t * 1.4) * .025);
    const size = Math.min(W, H) * .075;
    ctx.translate(shipX, shipY);
    ctx.rotate(-.22);
    ctx.fillStyle = "rgba(5,12,28,.94)";
    ctx.strokeStyle = selectedShip.color;
    ctx.shadowColor = selectedShip.color; ctx.shadowBlur = effectsLevel() === "low" ? 4 : 18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size, 0); ctx.lineTo(-size * .65, -size * .48); ctx.lineTo(-size * .35, 0);
    ctx.lineTo(-size * .65, size * .48); ctx.closePath(); ctx.fill(); ctx.stroke();
    const trail = 55 + t * 20;
    const trailGlow = ctx.createLinearGradient(-size * .45, 0, -size - trail, 0);
    trailGlow.addColorStop(0, selectedShip.laser); trailGlow.addColorStop(1, "transparent");
    ctx.strokeStyle = trailGlow; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-size * .4, 0); ctx.lineTo(-size - trail, 0); ctx.stroke();
    ctx.restore();

    if (t > 3.3) {
      const cockpitFade = Math.min(.72, (t - 3.3) * .35);
      ctx.fillStyle = `rgba(2,4,12,${cockpitFade})`;
      ctx.beginPath();
      ctx.moveTo(0, H); ctx.lineTo(0, H * .7); ctx.lineTo(W * .2, H * .84); ctx.lineTo(W * .32, H); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, H); ctx.lineTo(W, H * .7); ctx.lineTo(W * .8, H * .84); ctx.lineTo(W * .68, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,123,53,${cockpitFade})`;
      ctx.beginPath(); ctx.moveTo(W * .82, H); ctx.lineTo(W * .73, H * .84); ctx.lineTo(W * .77, H * .72); ctx.stroke();
    }

    ctx.fillStyle = "#eaffff";
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.max(22, W * .028)}px Consolas, monospace`;
    const title = t < 2.2 ? "OMEGA CORE CRITICAL" : t < 4 ? "SIGNAL LOST" : "A NEW DAWN";
    ctx.fillText(title, W / 2, H * .18);
    ctx.font = "11px Consolas, monospace";
    ctx.fillStyle = t < 2.2 ? "#ff7b35" : "#36f4ff";
    const subtitle = t < 2.2 ? "DETONATION CASCADE" : t < 4 ? "..." : "CONTROL: WE HEAR YOU, PILOT.";
    ctx.fillText(subtitle, W / 2, H * .22);
  }

  function calculateMissionRank() {
    const accuracy = shotsFired ? shotsHit / shotsFired : 0;
    const hull = Math.max(0, player.hull / player.maxHull);
    let rating = accuracy * 42 + hull * 28 + Math.min(1, kills / 30) * 20;
    if (selectedDifficultyKey === "nightmare") rating += 12;
    else if (selectedDifficultyKey === "ace") rating += 5;
    if (damageSustained < 10) rating += 5;
    missionRank = rating >= 88 ? "S" : rating >= 72 ? "A" : rating >= 52 ? "B" : "C";
    return { rank: missionRank, accuracy: Math.round(accuracy * 100), hull: Math.round(hull * 100) };
  }

  function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function endGame(won) {
    if (state !== "playing" && state !== "cinematic") return;
    stopAudioScene();
    ui.escapeHud.classList.add("hidden");
    ui.hud.classList.remove("escape-danger");
    state = "result"; ui.hud.classList.add("hidden"); showOnly(ui.result);
    $("#resultEyebrow").textContent = won ? "OMEGA CORE DESTROYED" : "SIGNAL LOST";
    $("#resultTitle").innerHTML = won ? "MISSION<br><span>COMPLETE</span>" : "MISSION<br><span>FAILED</span>";
    const report = calculateMissionRank();
    missionRank = won ? report.rank : "F";
    telemetry.result = {
      won, rank: missionRank, score: Math.floor(score), kills,
      accuracy: report.accuracy, hull: report.hull,
      damageSustained: Math.round(damageSustained),
      duration: Number(gameTime.toFixed(2))
    };
    telemetry.performance = performanceReport();
    if (benchmarkMode) {
      ui.benchmarkReport.textContent = JSON.stringify(telemetry);
      document.documentElement.dataset.benchmark = "complete";
    }
    localStorage.setItem("trenchRunnerLastPlaytest", JSON.stringify(telemetry));
    $("#finalScore").textContent = Math.floor(score); $("#finalKills").textContent = kills; $("#finalCombo").textContent = `x${maxCombo}`;
    $("#finalAccuracy").textContent = `${report.accuracy}%`;
    $("#missionRank").textContent = missionRank;
    $("#rankReason").textContent = won ? `${report.hull}% HULL // ${selectedDifficulty.name}` : "CRAFT LOST";
    $("#saveScoreButton").disabled = false;
    tone(won ? 440 : 110, 1.2, won ? "sine" : "sawtooth", .07, won ? 440 : -60);
  }

  function getScores() {
    try { return JSON.parse(localStorage.getItem("trenchRunnerScores")) || []; } catch { return []; }
  }

  function saveScore() {
    const name = ($("#pilotName").value.trim() || "ACE").toUpperCase().slice(0, 10);
    const scores = getScores();
    scores.push({
      name, score: Math.floor(score), phase: PHASES[phaseIndex]?.name || "UNKNOWN",
      ship: selectedShip.name, difficulty: selectedDifficulty.name, rank: missionRank,
      date: new Date().toISOString().slice(0, 10)
    });
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem("trenchRunnerScores", JSON.stringify(scores.slice(0, 10)));
    $("#saveScoreButton").disabled = true; toast("SCORE GESPEICHERT");
  }

  function showScores() {
    showOnly(ui.leaderboard);
    const scores = getScores();
    $("#scoreList").innerHTML = scores.length ? scores.map((s, i) =>
      `<li data-rank="${String(i + 1).padStart(2, "0")}"><b>${escapeHtml(`${s.name} [${s.rank || "-"}]`)}</b><strong>${String(s.score).padStart(6, "0")}</strong><small>${escapeHtml(`${s.ship || "---"} / ${s.difficulty || "ACE"}`)}</small></li>`
    ).join("") : `<li data-rank="--"><b>NO RECORDS</b><strong>000000</strong><small>---</small></li>`;
  }

  function exportTelemetry() {
    const data = localStorage.getItem("trenchRunnerLastPlaytest") || JSON.stringify(telemetry, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `trench-runner-playtest-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  window.TR_BENCHMARK = {
    enabled: benchmarkMode,
    snapshot: () => ({
      state, phaseIndex, phase: PHASES[phaseIndex]?.name, phaseTime, gameTime,
      enemies: enemies?.length || 0, enemyShots: enemyShots?.length || 0,
      shots: shots?.length || 0, particles: particles?.length || 0,
      hull: player?.hull || 0, score: Math.floor(score || 0),
      performance: performanceStats ? performanceReport() : null
    }),
    result: () => telemetry
  };
  window.TR_JURY = {
    enabled: juryMode,
    maxSeconds: JURY_MAX_SECONDS,
    snapshot: () => ({
      enabled: juryMode,
      state,
      ship: selectedShipKey,
      difficulty: selectedDifficultyKey,
      seconds: Number(juryClock.toFixed(2)),
      gameTime: Number((gameTime || 0).toFixed(2)),
      phaseIndex,
      phase: PHASES[phaseIndex]?.name,
      bossAssist: juryBossAssist
    })
  };
  window.TR_TRAILER = {
    enabled: trailerMode,
    complete: false,
    bytes: 0,
    snapshot: () => ({
      recording: trailerRecording,
      complete: window.TR_TRAILER.complete,
      seconds: Number(trailerClock.toFixed(2)),
      state,
      phase: PHASES[phaseIndex]?.name,
      bytes: window.TR_TRAILER.bytes
    })
  };
  window.TR_OFFLINE_TRAILER = {
    enabled: offlineTrailerMode,
    fps: 30,
    frame: 0,
    renderFrame: () => {
      if (!offlineTrailerMode) throw new Error("Offline trailer mode is not enabled.");
      const dt = 1 / 30;
      trailerRecording = true;
      trailerClock += dt;
      recordPerformance(dt);
      update(dt);
      draw();
      window.TR_OFFLINE_TRAILER.frame += 1;
      return canvas.toDataURL("image/jpeg", .92);
    },
    snapshot: () => ({
      ready: offlineTrailerMode && state === "playing",
      frame: window.TR_OFFLINE_TRAILER.frame,
      seconds: Number(trailerClock.toFixed(3)),
      state,
      phase: PHASES[phaseIndex]?.name
    })
  };
  window.TR_ACCESSIBILITY = {
    snapshot: () => ({
      subtitles: settings.subtitles,
      colorVision: settings.colorVision,
      reducedMotion: settings.reducedMotion,
      bindings: { ...settings.bindings },
      rebindingAction
    }),
    setBinding
  };
  window.TR_QA = {
    snapshot: () => ({
      state,
      width: W,
      height: H,
      dpr: DPR,
      playerX: Number((player?.x || 0).toFixed(4)),
      playerY: Number((player?.y || 0).toFixed(4)),
      shots: shots?.length || 0,
      phaseIndex,
      effects: runtimeEffects,
      gamepadConnected: Boolean(navigator.getGamepads?.()[0]),
      voiceAssets: [
        "control-launch", "control-weapons-free", "nexus-warning",
        "archon-reveal", "control-escape", "control-finale"
      ].filter(name => assetBuffers[name]).length,
      voiceActive: Boolean(currentVoiceSource)
    })
  };

  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function loop(ts) {
    const rawDt = (ts - last) / 1000 || 0;
    const dt = Math.min(.033, rawDt); last = ts;
    if (juryMode && (state === "playing" || state === "cinematic")) {
      juryClock += rawDt;
      if (juryClock >= JURY_MAX_SECONDS && state !== "result") {
        endGame(state === "cinematic" || phaseIndex === 4);
      }
    }
    if (trailerRecording) {
      trailerClock += rawDt;
      if (trailerClock >= 60 && trailerRecorder?.state === "recording") {
        trailerRecording = false;
        trailerRecorder.stop();
      }
    }
    recordPerformance(rawDt);
    update(dt); draw(); requestAnimationFrame(loop);
    if (benchmarkMode && state !== "result" && ui.benchmarkReport && performanceStats) {
      ui.benchmarkReport.textContent = JSON.stringify(window.TR_BENCHMARK.snapshot());
    }
  }

  addEventListener("resize", resize);
  addEventListener("keydown", e => {
    initAudio();
    if (rebindingAction) {
      e.preventDefault();
      if (e.code === "Escape" && rebindingAction !== "pause") {
        rebindingAction = null;
        updateBindingButtons();
        toast("BELEGUNG ABGEBROCHEN");
        return;
      }
      setBinding(rebindingAction, e.code);
      return;
    }
    keys[e.code] = true;
    if (Object.values(settings.bindings).includes(e.code)) e.preventDefault();
    if (e.code === "Enter" && state === "menu") startBriefing();
    if (e.code === settings.bindings.pause && (state === "playing" || state === "paused")) pauseGame();
    if (e.code === settings.bindings.shield && state === "playing") shieldPulse();
    if (e.code === settings.bindings.vector) {
      vectorMode = !vectorMode;
      toast(vectorMode ? "RETRO VECTOR MODE" : "MODERN NEON MODE");
      tone(vectorMode ? 880 : 440, .12, "square", .035);
      if (tutorialStep === 4) advanceTutorial(1);
    }
  });
  addEventListener("keyup", e => keys[e.code] = false);
  $("#startButton").onclick = startBriefing; $("#skipButton").onclick = launch;
  $("#resumeButton").onclick = pauseGame; $("#quitButton").onclick = quitGame;
  $("#scoresButton").onclick = showScores; $("#closeScoresButton").onclick = () => showOnly(ui.menu);
  $("#settingsButton").onclick = openSettings;
  $("#closeSettingsButton").onclick = applySettings;
  ["musicVolume", "sfxVolume", "sensitivity"].forEach(id => {
    $(`#${id}`).oninput = updateSettingsLabels;
  });
  $("#fullscreenButton").onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  $("#saveScoreButton").onclick = saveScore; $("#restartButton").onclick = startBriefing;
  $("#exportTelemetryButton").onclick = exportTelemetry;
  document.querySelectorAll(".keybind-button").forEach(button => {
    button.onclick = () => {
      rebindingAction = button.dataset.bindAction;
      updateBindingButtons();
      toast(`${BINDING_LABELS[rebindingAction]} // TASTE DRÜCKEN`);
    };
  });
  $("#resetBindingsButton").onclick = () => {
    settings.bindings = { ...DEFAULT_BINDINGS };
    rebindingAction = null;
    updateBindingButtons();
    toast("STANDARDTASTEN GELADEN");
  };
  document.querySelectorAll(".ship-card").forEach(card => {
    card.onclick = () => selectShip(card.dataset.ship);
  });
  document.querySelectorAll(".difficulty-card").forEach(card => {
    card.onclick = () => selectDifficulty(card.dataset.difficulty);
  });

  selectShip(selectedShipKey, false);
  selectDifficulty(selectedDifficultyKey, false);
  if (juryMode) {
    document.body.classList.add("jury-mode");
    const badge = document.createElement("div");
    badge.id = "juryModeBadge";
    badge.innerHTML = "<b>JURY RUN</b><span>VANGUARD // ACE // MAX 100 SEC</span>";
    document.body.appendChild(badge);
  }
  document.body.classList.toggle("reduced-effects", settings.effects === "low");
  applyAccessibilitySettings();
  updateBindingButtons();
  resize(); resetGame();
  if (captureMode) {
    prepareCaptureScene(captureScene);
  } else if (autoPilotMode) {
    tutorialDone = true;
    launch();
  } else if (juryMode) {
    startBriefing();
  } else {
    showOnly(ui.menu);
  }
  if (offlineTrailerMode) {
    draw();
    document.documentElement.dataset.offlineTrailer = "ready";
  } else {
    requestAnimationFrame(loop);
  }
})();
