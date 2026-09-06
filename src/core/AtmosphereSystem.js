/**
 * AtmosphereSystem.js
 * Main Orchestrator for Procedural Environment
 * Uses AtmosphereData, SkyVisuals, and LensFlareManager
 */

const AtmosphereSystem = (() => {
  let _scene, sunLight, moonLight, hemiLight, ambientLight;
  let _active = false, _gameHour = 8.0, _solarAnimTime = 0;
  const _smoothPlayerPos = new THREE.Vector3(AtmosphereData.CENTER_X, 0, AtmosphereData.CENTER_Z);
  const SHADOW_LERP = 0.08;

  const _raycaster = new THREE.Raycaster();
  let _sunOccluded = false;
  let _moonOccluded = false;
  let _indoorFactor = 0; // 0 = outdoors, 1 = fully enclosed room with roof
  let _raycastAccum = 0; // Throttle raycasts to avoid per-frame overhead
  const RAYCAST_INTERVAL = 1 / 12; // 12 checks per second max

  async function init(startHour = 8.0) {
    _scene = Engine.getScene(); if (!_scene) return;
    _gameHour = startHour; _active = true;
    if (window.PlayerController?.getPosition) {
      _smoothPlayerPos.copy(PlayerController.getPosition());
    }
    _scene.background = _scene.environment = null;

    SkyVisuals.createSkyShader(_scene);
    SkyVisuals.createStarField(_scene);
    await SkyVisuals.createSun(_scene);
    await SkyVisuals.createMoon(_scene);
    LensFlareManager.init(_scene);

    const shadowsEnabled = (window.Settings && typeof Settings.get === 'function') ? (Settings.get('shadows') !== false) : true;

    sunLight = new THREE.DirectionalLight(0xfffbeb, 0); sunLight.name = 'SunLight';
    sunLight.castShadow = shadowsEnabled;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const shadowRes = isMobile ? 512 : 2048;
    sunLight.shadow.mapSize.set(shadowRes, shadowRes);
    sunLight.shadow.camera.near = 0.5; 
    sunLight.shadow.camera.far = 140;
    const shadowFrustumSize = 40;
    sunLight.shadow.camera.left   = -shadowFrustumSize;
    sunLight.shadow.camera.right  =  shadowFrustumSize;
    sunLight.shadow.camera.top    =  shadowFrustumSize;
    sunLight.shadow.camera.bottom = -shadowFrustumSize;
    sunLight.shadow.bias       = -0.00015; // Tight bias to eliminate shadow acne
    sunLight.shadow.normalBias =  0.004;   // Minimized normalBias to eliminate light leaking at wall/ceiling corners
    sunLight.shadow.radius     =  1.0;     // Crisp shadow radius to prevent PCF light bleeding through thin walls
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.layers.enable(1);
    sunLight.shadow.camera.layers.enable(1);
    _scene.add(sunLight); _scene.add(sunLight.target);

    moonLight = new THREE.DirectionalLight(0xa5c4f2, 0.0); moonLight.name = 'MoonLight';
    moonLight.castShadow = shadowsEnabled;
    moonLight.shadow.mapSize.set(shadowRes, shadowRes);
    moonLight.shadow.camera.near = 0.5; 
    moonLight.shadow.camera.far = 140;
    const moonShadowSize = 40;
    moonLight.shadow.camera.left   = -moonShadowSize;
    moonLight.shadow.camera.right  =  moonShadowSize;
    moonLight.shadow.camera.top    =  moonShadowSize;
    moonLight.shadow.camera.bottom = -moonShadowSize;
    moonLight.shadow.bias       = -0.00015;
    moonLight.shadow.normalBias =  0.004;
    moonLight.shadow.radius     =  1.0;
    moonLight.shadow.camera.updateProjectionMatrix();
    moonLight.layers.enable(1);
    moonLight.shadow.camera.layers.enable(1);
    _scene.add(moonLight); _scene.add(moonLight.target);

    hemiLight = new THREE.HemisphereLight(0x2a4060, 0x0a1520, 0.15); hemiLight.layers.enable(1); _scene.add(hemiLight);
    ambientLight = new THREE.AmbientLight(0x8090b0, 0.20); ambientLight.layers.enable(1); _scene.add(ambientLight);

    _applyAtmosphere(_gameHour, 0.016);
  }

  function _applyAtmosphere(h, delta = 0.016, playerPos = null) {
    _solarAnimTime += delta;
    const phase = AtmosphereData.lerpPhase(h);
    const target = playerPos || (window.PlayerController ? PlayerController.getPosition() : new THREE.Vector3(AtmosphereData.CENTER_X, 0, AtmosphereData.CENTER_Z));
    _smoothPlayerPos.lerp(target, SHADOW_LERP);

    const sunVis = AtmosphereData.getSunVisibility(h);
    const moonVis = AtmosphereData.getMoonVisibility(h);
    const sp = AtmosphereData.getCelestialPos(h, 6, _smoothPlayerPos);
    const mp = AtmosphereData.getCelestialPos(h, 18, _smoothPlayerPos);

    // ─── Wall & Ceiling Line-Of-Sight Occlusion (Throttled 12Hz) ───
    _raycastAccum += delta;
    const mazeObj = _scene ? _scene.getObjectByName('Maze') : null;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const lowQuality = (window.Settings && Settings.get('quality') === 'low');

    // Performance Optimization: Skip expensive raycasting on low-end mobile devices
    if (mazeObj && _raycastAccum >= RAYCAST_INTERVAL && !(isMobile && lowQuality)) {
      _raycastAccum = 0;
      const activeCam = (typeof CameraController !== 'undefined' && CameraController.getActive) ? CameraController.getActive() : null;
      const eyePos = activeCam ? activeCam.position.clone() : new THREE.Vector3(target.x, target.y + 1.6, target.z);

      // 1. Vertical Raycast: is camera under a ceiling?
      _raycaster.set(eyePos, new THREE.Vector3(0, 1, 0));
      _raycaster.far = 18;
      const roofHits = _raycaster.intersectObject(mazeObj, true);
      const targetIndoor = roofHits.length > 0 ? 1.0 : 0.0;
      _indoorFactor += (targetIndoor - _indoorFactor) * 0.4; // Fast snap to indoor/outdoor state

      // 2. Line of Sight from eye → Sun
      if (sunVis > 0 && sp.y > 0) {
        const sunDir = new THREE.Vector3(sp.x - eyePos.x, sp.y - eyePos.y, sp.z - eyePos.z).normalize();
        _raycaster.set(eyePos, sunDir);
        _raycaster.far = 140;
        const sunHits = _raycaster.intersectObject(mazeObj, true);
        _sunOccluded = sunHits.length > 0;
      } else {
        _sunOccluded = true;
      }

      // 3. Line of Sight from eye → Moon
      if (moonVis > 0 && mp.y > 0) {
        const moonDir = new THREE.Vector3(mp.x - eyePos.x, mp.y - eyePos.y, mp.z - eyePos.z).normalize();
        _raycaster.set(eyePos, moonDir);
        _raycaster.far = 140;
        const moonHits = _raycaster.intersectObject(mazeObj, true);
        _moonOccluded = moonHits.length > 0;
      } else {
        _moonOccluded = true;
      }
    } else if (!mazeObj) {
      _sunOccluded = false;
      _moonOccluded = false;
      _indoorFactor = 0;
    }

    // Pass occlusion states to Celestial & Flare Renderers
    SkyVisuals.setSunOccluded(_sunOccluded);
    SkyVisuals.setMoonOccluded(_moonOccluded);
    LensFlareManager.update(sp, _sunOccluded ? 0 : sunVis, delta);

    // ─── Realistic indoor/outdoor lighting attenuation ───
    // When under a ceiling, sky/hemi/ambient light is heavily cut.
    // Directional sun/moon light is killed entirely when indoors to prevent light leaking through walls.
    const indoorMult = 1.0 - _indoorFactor;          // 1.0 outdoors → 0.0 fully indoor
    const ambientIndoorFloor = 0.08;                  // Minimum cave-like ambient indoors

    const outdoorAmbIntensity = phase.ambIntensity;
    if (ambientLight) {
      ambientLight.color.setRGB(...phase.ambColor);
      // Keep enough ambient indoors to see walls even at night
      ambientLight.intensity = Math.max(ambientIndoorFloor, outdoorAmbIntensity * (0.22 + 0.78 * indoorMult));
    }
    if (hemiLight) {
      hemiLight.color.setRGB(...phase.zenith);
      hemiLight.groundColor.setRGB(...phase.ground);
      const outdoorHemi = THREE.MathUtils.lerp(0.15, 0.80, Math.max(0, Math.sin(((h - 6) / 12) * Math.PI)));
      // HemisphereLight bleeds omnidirectionally – kill it strongly indoors
      hemiLight.intensity = Math.max(0.015, outdoorHemi * (0.10 + 0.90 * indoorMult));
    }

    SkyVisuals.update(h, delta, _smoothPlayerPos, sunVis, moonVis, _solarAnimTime);

    const shadowsEnabled = (window.Settings && typeof Settings.get === 'function') ? (Settings.get('shadows') !== false) : true;

    if (sunLight) {
      const { color, intensity } = AtmosphereData.getSunColorIntensity(h);
      sunLight.color.setHex(color);
      // Kill directional sun light when indoors to prevent it beaming through walls/ceilings
      const sunBaseIntensity = (sp.y > 0 && sunVis > 0) ? (intensity * sunVis) : 0;
      sunLight.intensity = sunBaseIntensity * (0.0 + 1.0 * indoorMult); // 0 indoors, full outdoors

      // Force sync shadow casting with global settings every frame
      sunLight.castShadow = shadowsEnabled;

      const sunDir = new THREE.Vector3(
        sp.x - _smoothPlayerPos.x,
        sp.y - _smoothPlayerPos.y,
        sp.z - _smoothPlayerPos.z
      ).normalize();
      sunLight.position.copy(_smoothPlayerPos).addScaledVector(sunDir, 50);
      sunLight.target.position.copy(_smoothPlayerPos);
      sunLight.target.updateMatrixWorld();
    }

    if (moonLight) {
      const moonBaseIntensity = (mp.y > 0 && moonVis > 0) ? (moonVis * 0.85) : 0;
      // Kill directional moon light when indoors too
      moonLight.intensity = moonBaseIntensity * (0.0 + 1.0 * indoorMult); // 0 indoors, full outdoors

      // Force sync shadow casting with global settings every frame
      moonLight.castShadow = shadowsEnabled;

      const moonDir = new THREE.Vector3(
        mp.x - _smoothPlayerPos.x,
        mp.y - _smoothPlayerPos.y,
        mp.z - _smoothPlayerPos.z
      ).normalize();
      moonLight.position.copy(_smoothPlayerPos).addScaledVector(moonDir, 50);
      moonLight.target.position.copy(_smoothPlayerPos);
      moonLight.target.updateMatrixWorld();
    }

    const fc = phase.fogColor;
    const fogCol = (Math.round(fc[0]*255)<<16) | (Math.round(fc[1]*255)<<8) | Math.round(fc[2]*255);
    if (_scene.fog) { _scene.fog.color.setHex(fogCol); _scene.fog.density = phase.fogDensity; }
  }

  function setHour(hour, delta = 0.016, playerPos = null) {
    if (!_active) return;
    _gameHour = ((hour % 24) + 24) % 24;
    _applyAtmosphere(_gameHour, delta, playerPos);
  }

  function dispose() {
    if (!_scene) return;
    _active = false;
    SkyVisuals.dispose(_scene);
    LensFlareManager.dispose(_scene);

    const removable = [];
    _scene.traverse(obj => {
      if (obj && obj.isLight) removable.push(obj);
    });

    removable.forEach(light => {
      if (light.target && light.target.parent === _scene) _scene.remove(light.target);
      if (light.parent) light.parent.remove(light);
      if (light.shadow && light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    });

    [sunLight, moonLight, hemiLight, ambientLight].forEach(o => {
      if (o && o.parent) o.parent.remove(o);
      if (o && o.target && o.target.parent) o.target.parent.remove(o.target);
      if (o && o.geometry) o.geometry.dispose();
      if (o && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose && m.dispose());
      }
    });
    sunLight = moonLight = hemiLight = ambientLight = null;
  }

  return { init, setHour, getHour: () => _gameHour, isNight: () => (_gameHour >= 19 || _gameHour < 6), dispose };
})();
