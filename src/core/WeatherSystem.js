/**
 * WeatherSystem.js
 * Advanced Cinematic Weather System
 * Features:
 * - Dynamic evolving weather timeline (Heavy rain -> Light drizzle at 3m -> Rare drops at 5m -> Storm returns at 7m)
 * - Randomized Lightning between 20s and 60s with Short Quick Strikes vs Long Rolling Strikes
 * - Real-time procedural 3D Rain particle simulation and Fog transitions
 */

const WeatherSystem = (() => {
  let rainGroup       = null;
  let rainGeometry    = null;
  let rainPositions   = null;
  let snowGroup       = null;
  let snowGeometry    = null;
  let snowPositions   = null;
  let rainCount       = 3500;
  let rainActive      = false;

  let lightningLight  = null;
  let lightningBolt   = null;
  let lightningTimer  = 0;
  let nextStrikeTime  = 25.0;
  let isFlashing      = false;
  let flashSequence   = [];
  let flashDuration   = 0.35;

  let levelElapsed    = 0;
  let currentDensity  = 1.0;
  let targetDensity   = 1.0;

  const RAIN_BOX_SIZE = 48.0;
  const RAIN_HEIGHT   = 24.0;
  const RAIN_SPEED    = 32.0;
  const STREAK_LEN    = 0.75;
  const WIND_X        = -2.5;
  const WIND_Z        = 1.5;

  let currentWeather  = 'clear'; // 'clear' | 'rain' | 'storm' | 'snow' | 'rain_snow'
  let rainIntensity   = 1.0;
  let snowIntensity   = 1.0;
  let rainSpeed       = 1.0;
  let snowSpeed       = 1.0;
  let lightningEnabled = false;
  let stageFogColor   = null;
  let stageFogDensity = 0;

  // ─── Init ────────────────────────────────────────────────
  let startHour = 8.0; // Starts at 8:00 AM by default
  let timeSpeed = 0.0166;
  let timeLoop = true;

  function init(initialHour = 8.0, levelTimeSpeed = 0.0166, levelTimeLoop = true, levelRainIntensity = 1.0, levelSnowIntensity = 1.0, levelRainSpeed = 1.0, levelSnowSpeed = 1.0, levelLightningEnabled = false, fogColor = null, fogDensity = 0) {
    startHour = Number.isFinite(Number(initialHour)) ? Number(initialHour) : 8.0;
    timeSpeed = Number.isFinite(Number(levelTimeSpeed)) ? Number(levelTimeSpeed) : 1.0;
    timeLoop = levelTimeLoop !== false;
    rainIntensity = Math.max(0, Number(levelRainIntensity) || 0);
    snowIntensity = Math.max(0, Number(levelSnowIntensity) || 0);
    rainSpeed = Math.max(0, Number(levelRainSpeed) || 0);
    snowSpeed = Math.max(0, Number(levelSnowSpeed) || 0);
    lightningEnabled = levelLightningEnabled === true;
    stageFogColor = fogColor || null;
    stageFogDensity = Math.max(0, Number(fogDensity) || 0);
    const scene = Engine.getScene();
    if (!scene) return;

    dispose();

    // 1. Create Rain Particles
    rainGroup = new THREE.Group();
    rainGroup.name = 'WeatherSystem_Rain';

    const posArray = new Float32Array(rainCount * 2 * 3);
    rainPositions = posArray;

    for (let i = 0; i < rainCount; i++) {
      const idx = i * 6;
      const rx = (Math.random() - 0.5) * RAIN_BOX_SIZE;
      const ry = Math.random() * RAIN_HEIGHT;
      const rz = (Math.random() - 0.5) * RAIN_BOX_SIZE;

      posArray[idx]     = rx;
      posArray[idx + 1] = ry;
      posArray[idx + 2] = rz;

      posArray[idx + 3] = rx + (WIND_X / RAIN_SPEED) * STREAK_LEN;
      posArray[idx + 4] = ry - STREAK_LEN;
      posArray[idx + 5] = rz + (WIND_Z / RAIN_SPEED) * STREAK_LEN;
    }

    rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const rainMaterial = new THREE.LineBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const rainLines = new THREE.LineSegments(rainGeometry, rainMaterial);
    rainLines.frustumCulled = false;
    rainGroup.add(rainLines);
    rainGroup.visible = false;
    scene.add(rainGroup);

    snowGroup = new THREE.Group();
    snowGroup.name = 'WeatherSystem_Snow';
    snowPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      snowPositions[i * 3] = (Math.random() - 0.5) * RAIN_BOX_SIZE;
      snowPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX_SIZE;
    }
    snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    const snowTextureCanvas = document.createElement('canvas');
    snowTextureCanvas.width = snowTextureCanvas.height = 32;
    const snowTextureContext = snowTextureCanvas.getContext('2d');
    const snowGradient = snowTextureContext.createRadialGradient(16, 16, 0, 16, 16, 16);
    snowGradient.addColorStop(0, 'rgba(255,255,255,1)');
    snowGradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    snowGradient.addColorStop(1, 'rgba(255,255,255,0)');
    snowTextureContext.fillStyle = snowGradient;
    snowTextureContext.fillRect(0, 0, 32, 32);
    const snowTexture = new THREE.CanvasTexture(snowTextureCanvas);
    const snowPoints = new THREE.Points(snowGeometry, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, map: snowTexture, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    snowPoints.frustumCulled = false;
    snowGroup.add(snowPoints);
    snowGroup.visible = false;
    scene.add(snowGroup);

    // 2. Lightning Flash Light
    lightningLight = new THREE.DirectionalLight(0xdbeafe, 0);
    lightningLight.position.set(20, 80, 20);
    lightningLight.castShadow = false;
    scene.add(lightningLight);

    // 3. Lightning 3D Bolt
    _createLightningBolt(scene);

    // Random interval between 20s and 60s
    nextStrikeTime = 20.0 + Math.random() * 40.0;
    lightningTimer = 0;
    levelElapsed   = 0;
    currentDensity = 1.0;
    targetDensity  = 1.0;

    console.log('[WeatherSystem] Dynamic Weather System Initialized ✓');
  }

  // ─── Procedural Lightning 3D Bolt ────────────────────────
  function _createLightningBolt(scene) {
    const boltGeo = new THREE.BufferGeometry();
    const boltMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });

    lightningBolt = new THREE.LineSegments(boltGeo, boltMat);
    lightningBolt.frustumCulled = false;
    lightningBolt.visible = false;
    scene.add(lightningBolt);
  }

  function _generateBoltGeometry(startX, startY, startZ, isLong = false) {
    const segments = [];
    let curX = startX, curY = startY, curZ = startZ;
    const targetY = 10.0;
    const steps = isLong ? 28 : 16;
    const dy = (curY - targetY) / steps;

    for (let i = 0; i < steps; i++) {
      const spread = isLong ? 9.0 : 5.5;
      const nextX = curX + (Math.random() - 0.5) * spread;
      const nextY = curY - dy;
      const nextZ = curZ + (Math.random() - 0.5) * spread;

      segments.push(curX, curY, curZ, nextX, nextY, nextZ);

      // Random branches
      const branchChance = isLong ? 0.45 : 0.65;
      if (Math.random() > branchChance) {
        const branchLen = isLong ? 15.0 : 8.0;
        const branchEndX = nextX + (Math.random() - 0.5) * branchLen;
        const branchEndY = nextY - dy * 1.5;
        const branchEndZ = nextZ + (Math.random() - 0.5) * branchLen;
        segments.push(nextX, nextY, nextZ, branchEndX, branchEndY, branchEndZ);
      }

      curX = nextX;
      curY = nextY;
      curZ = nextZ;
    }

    lightningBolt.geometry.dispose();
    lightningBolt.geometry = new THREE.BufferGeometry();
    lightningBolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  }

  // ─── Set Weather Mode ────────────────────────────────────
  function setWeather(mode) {
    currentWeather = mode;
    console.log(`[WeatherSystem] Weather mode: "${mode}"`);

    const isRainyMode = (mode === 'rain' || mode === 'storm' || mode === 'rain_snow');
    const isSnowyMode = (mode === 'snow' || mode === 'rain_snow');

    if (isRainyMode || isSnowyMode) {
      rainActive = true;
      if (rainGroup) rainGroup.visible = isRainyMode;
      if (snowGroup) snowGroup.visible = isSnowyMode;
      if (isRainyMode) AudioManager.startRain(0.12);
      if (typeof SceneManager !== 'undefined' && SceneManager.setFog) {
        SceneManager.setFog(0x1e293b, 0.018);
      }
    } else {
      rainActive = false;
      if (rainGroup) rainGroup.visible = false;
      if (snowGroup) snowGroup.visible = false;
      AudioManager.stopRain(1.5);
      if (lightningLight) lightningLight.intensity = 0;
      if (lightningBolt) lightningBolt.visible = false;
    }
  }

  function toggleRain(enabled) {
    rainActive = !!enabled;
    if (rainGroup) {
      rainGroup.visible = rainActive;
      // Force immediate visual update
      rainGroup.traverse(node => { if (node.isLineSegments) node.visible = rainActive; });
    }

    if (!rainActive) {
      AudioManager.stopRain(0.5);
      if (lightningLight) lightningLight.intensity = 0;
      if (lightningBolt) lightningBolt.visible = false;
      isFlashing = false;
    } else {
      AudioManager.startRain(0.12);
    }
    console.log(`[WeatherSystem] Rain toggled: ${rainActive}`);
  }

  // ─── Update Dynamic Timeline & Clock ──────────────────────
  function _updateWeatherTimeline(delta, playerPos) {
    levelElapsed += delta;

    // 1. Dynamic rain & storm cycling (Only if rain is active)
    let weatherIcon = '☀️';
    let weatherLabel = 'نهار مشرق';

    if (rainActive && (currentWeather === 'rain' || currentWeather === 'storm' || currentWeather === 'rain_snow')) {
      currentDensity = rainIntensity;
      AudioManager.setRainVolume(0.12 * rainIntensity, 1.0);
      weatherIcon = lightningEnabled ? '⚡🌧️' : '🌧️';
      weatherLabel = lightningEnabled ? 'مطر ورعد' : 'مطر';
    } else if (rainActive && (currentWeather === 'snow' || currentWeather === 'rain_snow')) {
      weatherIcon = '❄️';
      weatherLabel = 'تساقط الثلوج';
    }

    // ── In-Game Clock & Celestial Orbit System (1 real second = 1 in-game minute) ──
    // timeSpeed is expressed in game-hours per real second, matching StudioWeather.
    const gameHour = startHour + (levelElapsed * timeSpeed);
    const gameHourFloat = timeLoop
      ? ((gameHour % 24) + 24) % 24
      : Math.min(Math.max(gameHour, 0), 23.999999);
    const totalGameMinutesFloat = gameHourFloat * 60;
    const minuteOfDay = totalGameMinutesFloat;

    // Update Celestial System continuously every frame
    if (typeof AtmosphereSystem !== 'undefined') {
      AtmosphereSystem.setHour(gameHourFloat, delta, playerPos);
    }
    if (typeof SceneManager !== 'undefined' && SceneManager.updateTime) {
      SceneManager.updateTime(gameHourFloat, delta);
    }
    if (typeof SceneManager !== 'undefined' && SceneManager.setFog && stageFogDensity > 0) {
      SceneManager.setFog(stageFogColor || '#b8d4f0', stageFogDensity);
    }

    // Discrete time for UI HUD badge text
    const totalGameMinutesInt = Math.floor(minuteOfDay);
    const curHour24 = Math.floor((totalGameMinutesInt / 60) % 24);
    const curMinute = Math.floor(totalGameMinutesInt % 60);
    const isNight = (curHour24 >= 19 || curHour24 < 6);
    const orbitAngle = (gameHourFloat / 24) * 360;

    if (currentWeather === 'snow' || currentWeather === 'rain_snow') {
      weatherIcon = '❄️';
      weatherLabel = 'تساقط الثلوج';
    } else if (!rainActive) {
      weatherIcon = isNight ? '🌙' : '☀️';
      weatherLabel = isNight ? 'ليل صافٍ' : 'نهار مشرق';
    } else if (isNight && weatherIcon === '⛅') {
      weatherIcon = '🌙☁️';
      weatherLabel = 'ليل غائم';
    }

    const isPM = curHour24 >= 12;
    const displayHour = (curHour24 % 12) === 0 ? 12 : (curHour24 % 12);
    const timeStr = `${String(displayHour).padStart(2, '0')}:${String(curMinute).padStart(2, '0')} ${isPM ? 'م' : 'ص'}`;

    // Update HUD Widget
    if (typeof HUD !== 'undefined' && HUD.updateCelestial) {
      HUD.updateCelestial({ timeStr, isNight, orbitAngle, weatherIcon, weatherLabel });
    }
  }

  // ─── Update Loop ─────────────────────────────────────────
  function update(delta, playerPos) {
    if (!rainGroup) return;

    const centerPos = playerPos || { x: 0, y: 0, z: 0 };

    _updateWeatherTimeline(delta, centerPos);

    // 1. Update Rain Particles (Continuous uniform distribution without waves or bursts)
    if (rainActive && rainPositions && (currentWeather === 'rain' || currentWeather === 'storm' || currentWeather === 'rain_snow')) {
      rainGroup.position.set(centerPos.x, 0, centerPos.z);

      const posAttr = rainGeometry.attributes.position;
      const arr = posAttr.array;
      const activeCount = Math.floor(rainCount * Math.max(0.04, currentDensity * rainIntensity));

      for (let i = 0; i < rainCount; i++) {
        const topIdx = i * 6;
        const botIdx = topIdx + 3;

        if (i < activeCount) {
          // Active falling drop
          arr[topIdx]     += WIND_X * rainSpeed * delta;
          arr[topIdx + 1] -= RAIN_SPEED * rainSpeed * delta;
          arr[topIdx + 2] += WIND_Z * rainSpeed * delta;

          // Continuous vertical wrap to maintain seamless uniform stream
          if (arr[topIdx + 1] < 0) {
            arr[topIdx + 1] += RAIN_HEIGHT;
            arr[topIdx]     = (Math.random() - 0.5) * RAIN_BOX_SIZE;
            arr[topIdx + 2] = (Math.random() - 0.5) * RAIN_BOX_SIZE;
          }

          arr[botIdx]     = arr[topIdx]     + (WIND_X / RAIN_SPEED) * STREAK_LEN;
          arr[botIdx + 1] = arr[topIdx + 1] - STREAK_LEN;
          arr[botIdx + 2] = arr[topIdx + 2] + (WIND_Z / RAIN_SPEED) * STREAK_LEN;
        } else {
          // Hide inactive drops below ground
          arr[topIdx + 1] = -100;
          arr[botIdx + 1] = -100;
        }
      }

      posAttr.needsUpdate = true;
    }

    if (rainActive && snowPositions && (currentWeather === 'snow' || currentWeather === 'rain_snow')) {
      snowGroup.position.set(centerPos.x, 0, centerPos.z);
      const activeCount = Math.floor(rainCount * Math.max(0.04, snowIntensity));
      for (let i = 0; i < rainCount; i++) {
        const idx = i * 3;
        if (i < activeCount) {
          snowPositions[idx + 1] -= (RAIN_SPEED * 0.18 * snowSpeed) * delta;
          snowPositions[idx] += Math.sin(levelElapsed + i) * delta * 0.35;
          if (snowPositions[idx + 1] < 0) {
            snowPositions[idx + 1] = RAIN_HEIGHT;
            snowPositions[idx] = (Math.random() - 0.5) * RAIN_BOX_SIZE;
            snowPositions[idx + 2] = (Math.random() - 0.5) * RAIN_BOX_SIZE;
          }
        } else {
          snowPositions[idx + 1] = -100;
        }
      }
      snowGeometry.attributes.position.needsUpdate = true;
    }

    // 2. Update Lightning (Interval randomized between 20s and 60s)
    if (rainActive && lightningEnabled && (currentWeather === 'rain' || currentWeather === 'storm' || currentWeather === 'rain_snow')) {
      lightningTimer += delta;

      if (!isFlashing && lightningTimer >= nextStrikeTime) {
        _triggerLightningStrike(centerPos);
      }

      _updateFlashSequence(delta);
    }
  }

  // ─── Trigger Lightning Strike (Short vs Long) ───────────
  function _triggerLightningStrike(playerPos) {
    isFlashing = true;
    lightningTimer = 0;
    // Next strike in 20s to 60s randomly
    nextStrikeTime = 20.0 + Math.random() * 40.0;

    // Determine strike type (Long rolling lightning vs Short quick strike)
    const isLong = Math.random() > 0.45; // 45% short, 55% long multi-pulse

    const strikeDist = 25 + Math.random() * 70;
    const strikeAngle = Math.random() * Math.PI * 2;
    const bx = playerPos.x + Math.cos(strikeAngle) * strikeDist;
    const bz = playerPos.z + Math.sin(strikeAngle) * strikeDist;
    const by = 85 + Math.random() * 25;

    _generateBoltGeometry(bx, by, bz, isLong);
    if (lightningBolt) lightningBolt.visible = true;

    if (isLong) {
      // Long Multi-Pulse Lightning (~0.95s duration)
      flashDuration = 0.95;
      flashSequence = [
        { t: 0.00, intensity: 4.2, bolt: true },
        { t: 0.10, intensity: 1.2, bolt: true },
        { t: 0.18, intensity: 6.5, bolt: true },
        { t: 0.32, intensity: 2.0, bolt: true },
        { t: 0.48, intensity: 5.2, bolt: true },
        { t: 0.70, intensity: 1.6, bolt: false },
        { t: 0.95, intensity: 0.0, bolt: false }
      ];
    } else {
      // Short Quick Strike (~0.26s duration)
      flashDuration = 0.26;
      flashSequence = [
        { t: 0.00, intensity: 5.0, bolt: true },
        { t: 0.05, intensity: 1.2, bolt: true },
        { t: 0.09, intensity: 5.8, bolt: true },
        { t: 0.18, intensity: 1.5, bolt: false },
        { t: 0.26, intensity: 0.0, bolt: false }
      ];
    }

    _flashStartTime = Engine.getElapsed ? Engine.getElapsed() : Date.now() / 1000;

    // Audio thunder with realistic distance delay (speed of sound ~340m/s)
    const delayMs = Math.floor(200 + (strikeDist / 340) * 800);
    setTimeout(() => {
      if (rainActive) {
        const thunderVol = Math.max(0.85, 1.3 - (strikeDist / 180));
        AudioManager.playThunder(thunderVol, isLong);
        TelegramAPI.haptic(isLong ? 'heavy' : 'medium');
      }
    }, delayMs);
  }

  let _flashStartTime = 0;
  function _updateFlashSequence(delta) {
    if (!isFlashing || !lightningLight) return;

    const now = Engine.getElapsed ? Engine.getElapsed() : Date.now() / 1000;
    const elapsed = now - _flashStartTime;

    if (elapsed >= flashDuration) {
      lightningLight.intensity = 0;
      if (lightningBolt) lightningBolt.visible = false;
      isFlashing = false;
      return;
    }

    let curInt = 0;
    let boltVis = false;
    for (let i = 0; i < flashSequence.length - 1; i++) {
      const k1 = flashSequence[i];
      const k2 = flashSequence[i + 1];
      if (elapsed >= k1.t && elapsed <= k2.t) {
        const alpha = (elapsed - k1.t) / (k2.t - k1.t);
        curInt = k1.intensity + alpha * (k2.intensity - k1.intensity);
        boltVis = k1.bolt;
        break;
      }
    }

    lightningLight.intensity = curInt;
    if (lightningBolt) lightningBolt.visible = boltVis;
  }

  // ─── Destroy / Dispose ───────────────────────────────────
  function dispose() {
    const scene = Engine.getScene();
    if (rainGroup && scene) {
      scene.remove(rainGroup);
      if (rainGeometry) rainGeometry.dispose();
      rainGroup = null;
    }
    if (snowGroup && scene) {
      scene.remove(snowGroup);
      if (snowGeometry) snowGeometry.dispose();
      const snowPoints = snowGroup.children[0];
      snowPoints?.material?.map?.dispose();
      snowPoints?.material?.dispose();
      snowGroup = null;
    }
    if (lightningLight && scene) {
      scene.remove(lightningLight);
      lightningLight = null;
    }
    if (lightningBolt && scene) {
      scene.remove(lightningBolt);
      if (lightningBolt.geometry) lightningBolt.geometry.dispose();
      lightningBolt = null;
    }
    rainActive = false;
    isFlashing = false;
    levelElapsed = 0;
  }

  return {
    init,
    setWeather,
    toggleRain,
    update,
    dispose,
    getMode: () => currentWeather,
    getTimeline: () => ({ elapsed: levelElapsed, density: currentDensity })
  };
})();
