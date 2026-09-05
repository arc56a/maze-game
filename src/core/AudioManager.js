/**
 * AudioManager.js
 * Web Audio API wrapper — SFX + background music
 */

const AudioManager = (() => {
  let ctx = null;
  let masterGain, gameMusicGain, sfxGain, uiGain, rainGain, thunderGain;
  let musicSource = null;
  let walkSource = null;
  let noiseBuffer = null;
  let sfxEnabled = true;
  let musicEnabled = true;
  const buffers = {};

  // Spatial Audio
  let listener = null;
  const spatialSources = [];

  // ─── Init ────────────────────────────────────────────────
  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain(); masterGain.gain.value = 1.0;

      // Initialize listener for spatial audio
      listener = ctx.listener;
      if (listener.forwardX) {
        // Modern API
        listener.forwardX.value = 0; listener.forwardY.value = 0; listener.forwardZ.value = -1;
        listener.upX.value = 0; listener.upY.value = 1; listener.upZ.value = 0;
      } else {
        // Legacy API
        listener.setOrientation(0, 0, -1, 0, 1, 0);
      }

      gameMusicGain = ctx.createGain(); gameMusicGain.gain.value = 0.4;
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8;
      uiGain = ctx.createGain(); uiGain.gain.value = 0.5;
      rainGain = ctx.createGain(); rainGain.gain.value = 0.5;
      thunderGain = ctx.createGain(); thunderGain.gain.value = 0.8;

      gameMusicGain.connect(masterGain);
      sfxGain.connect(masterGain);
      uiGain.connect(masterGain);
      rainGain.connect(masterGain);
      thunderGain.connect(masterGain);

      masterGain.connect(ctx.destination);
      console.log('[AudioManager] Initialized ✓');
    } catch (e) {
      console.warn('[AudioManager] Web Audio not supported', e);
    }
  }

  const audioLoadingPromises = {};

  // ─── Load ─────────────────────────────────────────────────
  async function load(key, url) {
    if (!ctx) return;
    if (buffers[key]) return buffers[key];

    // Check if AssetLoader already has this buffer (cached as global)
    if (window.AssetLoader && AssetLoader.get(url)) {
      const cached = AssetLoader.get(url);
      if (cached instanceof ArrayBuffer) {
        buffers[key] = await ctx.decodeAudioData(cached.slice(0));
        return buffers[key];
      }
    }

    if (audioLoadingPromises[key]) return audioLoadingPromises[key];

    audioLoadingPromises[key] = (async () => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        buffers[key] = await ctx.decodeAudioData(data);
        return buffers[key];
      } catch (e) {
        console.warn('[AudioManager] Failed to load:', url);
        return null;
      } finally {
        delete audioLoadingPromises[key];
      }
    })();

    return audioLoadingPromises[key];
  }

  // ─── Play SFX ─────────────────────────────────────────────
  function playSFX(key, volume = 1.0, duration = null) {
    if (!ctx || !sfxEnabled || !buffers[key]) return null;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffers[key];
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(sfxGain);
    src.start(0);

    if (duration) {
      src.stop(ctx.currentTime + duration);
    }
    return src;
  }

  // ─── Play Music ───────────────────────────────────────────
  function playMusic(key, loop = true) {
    if (!ctx || !musicEnabled || !buffers[key]) return;
    stopMusic();
    if (ctx.state === 'suspended') ctx.resume();
    musicSource = ctx.createBufferSource();
    musicSource.buffer = buffers[key];
    musicSource.loop = loop;
    musicSource.connect(gameMusicGain);
    musicSource.start(0);
  }

  function stopMusic(fadeOut = 0.5) {
    if (!musicSource) return;
    try {
      gameMusicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeOut);
      musicSource.stop(ctx.currentTime + fadeOut);
    } catch (e) { }
    setTimeout(() => {
      // Restore gain value from settings
      if (typeof Settings !== 'undefined') {
        gameMusicGain.gain.value = Settings.get('volGame') ?? 0.4;
      } else {
        gameMusicGain.gain.value = 0.4;
      }
      musicSource = null;
    }, (fadeOut + 0.1) * 1000);
  }

  // ─── Procedural SFX (no file needed) ─────────────────────
  function playTone(freq = 440, type = 'sine', duration = 0.1, vol = 0.3) {
    if (!ctx || !sfxEnabled) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // Common tones
  function playPickup() { playTone(880, 'sine', 0.15, 0.4); }

  // ─── Procedural Footsteps ────────────────────────────────
  function _getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const size = ctx.sampleRate * 1;
    noiseBuffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function playProceduralWalk(vol = 0.05) {
    if (!ctx || !sfxEnabled) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // 1. Pitch/Time Variation to prevent robotic repetition
    const pitchVar = 0.8 + Math.random() * 0.4;
    const duration = 0.06 * pitchVar; // Shorter duration

    // --- 1. Soft Thud (Deep impact) ---
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime((45 + Math.random() * 15) * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + duration);

    // Soft Attack to prevent clicking
    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(vol * 0.3, now + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(oscGain);
    oscGain.connect(sfxGain);

    // --- 2. Foot Friction (Grit) ---
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    noise.buffer = _getNoiseBuffer();

    // Bandpass focused on natural friction frequencies
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((1000 + Math.random() * 600) * pitchVar, now);
    filter.Q.value = 2.0;

    noise.playbackRate.value = pitchVar;

    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(vol * 0.2, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(sfxGain);

    // Random offset in buffer to avoid tonal repetition
    const offset = Math.random() * (noise.buffer.duration - duration - 0.1);

    osc.start(now);
    osc.stop(now + duration + 0.01);
    noise.start(now, offset);
    noise.stop(now + duration + 0.01);
  }

  // Custom SFX playing (from loaded files)
  function playWalk(variation = 1, duration = 0.3) {
    stopWalk();
    walkSource = playSFX(`walk_${variation}`, 0.4, duration);
  }

  function stopWalk() {
    if (walkSource) {
      try { walkSource.stop(); } catch (e) { }
      walkSource = null;
    }
  }

  function playSuccess() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => playTone(f, 'sine', 0.3, 0.5), i * 120)
    );
  }
  function playFail() {
    [400, 300, 200].forEach((f, i) =>
      setTimeout(() => playTone(f, 'sawtooth', 0.2, 0.6), i * 150)
    );
  }

  // ─── Weather SFX (Procedural Rain & Thunder) ────────────
  let rainNodes = null;

  function startRain(volume = 0.25) {
    if (!ctx || !sfxEnabled || rainNodes) return;
    if (ctx.state === 'suspended') ctx.resume();

    try {
      const now = ctx.currentTime;
      const noise = ctx.createBufferSource();
      noise.buffer = _getNoiseBuffer();
      noise.loop = true;

      // Filter 1: Mid-high frequencies for droplet patter
      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'bandpass';
      highFilter.frequency.setValueAtTime(1400, now);
      highFilter.Q.value = 1.2;

      // Filter 2: Low-mid for ambient rainfall body
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowpass';
      lowFilter.frequency.setValueAtTime(600, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 1.5);

      noise.connect(highFilter);
      noise.connect(lowFilter);
      highFilter.connect(gain);
      lowFilter.connect(gain);
      gain.connect(rainGain);

      noise.start(now);
      rainNodes = { noise, gain };
    } catch (e) {
      console.warn('[AudioManager] Failed to start rain audio:', e);
    }
  }

  function setRainVolume(vol, rampTime = 2.0) {
    if (!rainNodes || !ctx) return;
    try {
      const now = ctx.currentTime;
      rainNodes.gain.gain.linearRampToValueAtTime(Math.max(0, vol), now + rampTime);
    } catch (e) { }
  }

  function stopRain(fadeOut = 1.0) {
    if (!rainNodes || !ctx) return;
    try {
      const { noise, gain } = rainNodes;
      const now = ctx.currentTime;
      gain.gain.linearRampToValueAtTime(0.0001, now + fadeOut);
      setTimeout(() => {
        try { noise.stop(); noise.disconnect(); gain.disconnect(); } catch (e) { }
      }, (fadeOut + 0.1) * 1000);
      rainNodes = null;
    } catch (e) {
      rainNodes = null;
    }
  }

  function playThunder(vol = 1.0, isLong = false) {
    if (!ctx || !sfxEnabled) return;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const duration = isLong ? 7.5 : 4.5;

    // 1. Dual Sub-Bass Oscillators for wide atmospheric resonance
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    const baseFreq = isLong ? 85 : 70;
    osc1.frequency.setValueAtTime(baseFreq + Math.random() * 15, now);
    osc1.frequency.exponentialRampToValueAtTime(14, now + duration);

    // Slight detune on osc2 for realistic spatial thickness
    osc2.frequency.setValueAtTime(baseFreq * 0.75 + Math.random() * 10, now);
    osc2.frequency.exponentialRampToValueAtTime(12, now + duration);

    oscGain.gain.setValueAtTime(0, now);
    oscGain.gain.linearRampToValueAtTime(vol * (isLong ? 0.95 : 0.8), now + 0.05);

    if (isLong) {
      // Secondary rolling rumble swells
      oscGain.gain.setValueAtTime(vol * 0.75, now + 1.2);
      oscGain.gain.setValueAtTime(vol * 0.55, now + 2.5);
      oscGain.gain.setValueAtTime(vol * 0.35, now + 4.2);
    }
    // Long natural smooth fade-out
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc1.connect(oscGain);
    osc2.connect(oscGain);
    oscGain.connect(sfxGain);

    // 2. Powerful lightning strike crack with continuous looping noise for full duration
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    noise.buffer = _getNoiseBuffer();
    noise.loop = true; // Crucial: continuous stream without running out midway

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isLong ? 750 : 550, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + duration);

    noiseGain.gain.setValueAtTime(0, now);
    // Instant explosive crack attack
    noiseGain.gain.linearRampToValueAtTime(vol * (isLong ? 1.35 : 1.1), now + 0.02);

    if (isLong) {
      // Natural rolling waves of echoing thunder
      noiseGain.gain.setValueAtTime(vol * 0.7, now + 0.8);
      noiseGain.gain.setValueAtTime(vol * 0.5, now + 2.0);
      noiseGain.gain.setValueAtTime(vol * 0.25, now + 3.8);
    }

    // Extended, silky smooth exponential decay into absolute silence
    noiseGain.gain.exponentialRampToValueAtTime(0.00001, now + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(thunderGain);

    osc1.start(now);
    osc2.start(now);
    noise.start(now);

    osc1.stop(now + duration + 0.1);
    osc2.stop(now + duration + 0.1);
    noise.stop(now + duration + 0.1);
  }

  // ─── Controls ─────────────────────────────────────────────
  function toggleSFX(on) { sfxEnabled = on; }
  function toggleMusic(on) { musicEnabled = on; if (!on) stopMusic(); }
  function setMasterVolume(v) { if (masterGain) masterGain.gain.value = v; }

  function setMenuVolume(v) {
    if (uiGain) uiGain.gain.value = v;
    const menuAudio = document.getElementById('menu-audio');
    if (menuAudio) menuAudio.volume = v;
  }
  function setGameMusicVolume(v) { if (gameMusicGain) gameMusicGain.gain.value = v; }
  function setRainVolumeGlobal(v) { if (rainGain) rainGain.gain.value = v; }
  function setThunderVolumeGlobal(v) { if (thunderGain) thunderGain.gain.value = v; }

  function resume() { ctx?.resume(); }

  // ─── Spatial Audio Methods ───────────────────────────────
  function updateListener(camera) {
    if (!ctx || !listener || !camera) return;
    const pos = camera.position;
    const matrix = camera.matrixWorld;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);

    if (listener.positionX) {
      listener.positionX.value = pos.x; listener.positionY.value = pos.y; listener.positionZ.value = pos.z;
      listener.forwardX.value = forward.x; listener.forwardY.value = forward.y; listener.forwardZ.value = forward.z;
      listener.upX.value = up.x; listener.upY.value = up.y; listener.upZ.value = up.z;
    } else {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  async function playSpatial(key, x, y, z, options = {}) {
    if (!ctx || !buffers[key]) return null;
    if (ctx.state === 'suspended') ctx.resume();

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = options.distance || 10000;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 0;

    if (panner.positionX) {
      panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z;
    } else {
      panner.setPosition(x, y, z);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffers[key];
    src.loop = options.loop !== false;

    const gain = ctx.createGain();
    gain.gain.value = options.volume !== undefined ? options.volume : 0.5;

    src.connect(panner);
    panner.connect(gain);
    gain.connect(sfxGain);

    src.start(0);
    const entry = { src, panner, gain, key };
    spatialSources.push(entry);
    return entry;
  }

  function clearSpatial() {
    spatialSources.forEach(s => {
      try { s.src.stop(); s.src.disconnect(); s.panner.disconnect(); s.gain.disconnect(); } catch(e) {}
    });
    spatialSources.length = 0;
  }

  return {
    init, load, playSFX, playMusic, stopMusic,
    playTone, playPickup, playWalk, stopWalk, playProceduralWalk, playSuccess, playFail,
    startRain, stopRain, setRainVolume, playThunder,
    toggleSFX, toggleMusic, setMasterVolume, resume,
    setMenuVolume, setGameMusicVolume, setRainVolumeGlobal, setThunderVolumeGlobal,
    updateListener, playSpatial, clearSpatial
  };
})();
