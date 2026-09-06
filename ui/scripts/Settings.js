/**
 * Settings.js — stores and applies player preferences
 */

const Settings = (() => {
  const STORAGE_KEY = 'maze3d_settings';

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

  const defaults = {
    language: 'ar',
    cameraMode: 'third',
    mobileFullscreen: true,
    autoLandscape: true,
    sfx: true,
    music: true,
    quality: isMobile ? 'medium' : 'medium', // Start at Medium to keep details
    sensitivity: 1.0,
    haptic: true,
    antialiasing: !isMobile,
    shadows: false,                        // Totally disabled
    volMenu: 0.5,
    volGame: 0.4,
    volRain: 0.5,
    volThunder: 0.8,
    grass: true,                           // Enable grass by default
    rain: true
  };

  let data = { ...defaults };
  let appliedData = { ...defaults }; // To track what is actually saved/active

  function isPhoneDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
  }

  // ─── Load ─────────────────────────────────────────────────
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      data = { ...defaults, ...saved };
      appliedData = { ...data }; // Sync applied data with loaded data
    } catch (e) {
      data = { ...defaults };
      appliedData = { ...defaults };
    }
    _applyAll();
    _syncMobileSettingsUI();
    console.log('[Settings] Loaded:', data);
  }

  // ─── Save ─────────────────────────────────────────────────
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      appliedData = { ...data }; // Mark current data as applied
    }
    catch (e) { }
  }

  // ─── Getters / Setters ────────────────────────────────────
  function get(key) { return data[key]; }
  function set(key, value) {
    data[key] = value;
    // We don't save to localStorage yet, only apply to the current session
  }

  function confirmSave() {
    try {
      const aaChanged = (data.antialiasing !== appliedData.antialiasing);
      const langChanged = (data.language !== appliedData.language);
      const needsRestart = aaChanged || langChanged;

      save();
      _applyAll();

      const statusEl = document.getElementById('settings-status-msg');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'settings-status visible success';
        statusEl.innerHTML = 'تم حفظ الإعدادات وتطبيقها بنجاح! ✨';

        if (needsRestart) {
          statusEl.className = 'settings-status visible info';
          statusEl.innerHTML = 'تم الحفظ! 💾 <br><small style="font-size:11px;">ملاحظة: تنعيم الحواف يتطلب إعادة التشغيل.</small>';
        }

        clearTimeout(window._settingsTimer);
        window._settingsTimer = setTimeout(() => {
          statusEl.classList.remove('visible');
          setTimeout(() => { if (!statusEl.classList.contains('visible')) statusEl.style.display = 'none'; }, 500);
        }, 4000);
      }

      if (window.TelegramAPI && typeof window.TelegramAPI.haptic === 'function') {
        window.TelegramAPI.haptic('medium');
      }
    } catch (err) {
      console.error('[Settings] Error in confirmSave:', err);
    }
  }

  function resetToDefaults() {
    data = { ...defaults };
    save();
    _applyAll();

    const statusEl = document.getElementById('settings-status-msg');
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'settings-status visible info';
      statusEl.innerHTML = 'تمت استعادة الإعدادات الافتراضية 🔄';

      clearTimeout(window._settingsTimer);
      window._settingsTimer = setTimeout(() => {
        statusEl.classList.remove('visible');
        setTimeout(() => { if (!statusEl.classList.contains('visible')) statusEl.style.display = 'none'; }, 500);
      }, 3000);
    }

    if (window.TelegramAPI) TelegramAPI.haptic('light');
  }

  // ─── Language ─────────────────────────────────────────────
  function setLanguage(lang) {
    if (lang === 'en') {
      if (window.UI) UI.toast('اللغة الإنجليزية ستتوفر قريباً!', 'info');
      return;
    }
    set('language', lang);
    _updateLanguageUI();
  }

  function _updateLanguageUI() {
    const lang = data.language;
    document.getElementById('lang-ar')?.classList.toggle('active', lang === 'ar');
    document.getElementById('lang-en')?.classList.toggle('active', lang === 'en');
  }

  // ─── Camera mode ──────────────────────────────────────────
  function setCameraMode(mode) {
    set('cameraMode', mode);
    document.getElementById('cam-first')?.classList.toggle('active', mode === 'first');
    document.getElementById('cam-third')?.classList.toggle('active', mode === 'third');
    if (window.CameraController) CameraController.setMode(mode);
  }

  function _syncMobileSettingsUI() {
    const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;
    document.getElementById('phone-fullscreen-on')?.classList.toggle('active', data.mobileFullscreen);
    document.getElementById('phone-fullscreen-off')?.classList.toggle('active', !data.mobileFullscreen);
    document.getElementById('phone-landscape-on')?.classList.toggle('active', data.autoLandscape);
    document.getElementById('phone-landscape-off')?.classList.toggle('active', !data.autoLandscape);

    if (!isPhone) {
      document.getElementById('phone-fullscreen-on')?.setAttribute('disabled', 'disabled');
      document.getElementById('phone-fullscreen-off')?.setAttribute('disabled', 'disabled');
      document.getElementById('phone-landscape-on')?.setAttribute('disabled', 'disabled');
      document.getElementById('phone-landscape-off')?.setAttribute('disabled', 'disabled');
    } else {
      document.getElementById('phone-fullscreen-on')?.removeAttribute('disabled');
      document.getElementById('phone-fullscreen-off')?.removeAttribute('disabled');
      document.getElementById('phone-landscape-on')?.removeAttribute('disabled');
      document.getElementById('phone-landscape-off')?.removeAttribute('disabled');
    }
  }

  function setMobileFullscreen(enabled) {
    set('mobileFullscreen', !!enabled);
    _syncMobileSettingsUI();
  }

  function setAutoLandscape(enabled) {
    set('autoLandscape', !!enabled);
    _syncMobileSettingsUI();
  }

  function requestMobileGamePresentation() {
    const isPhone = isPhoneDevice();
    if (!isPhone) return;

    const enableFullscreen = data.mobileFullscreen !== false;
    document.body.classList.toggle('mobile-fullscreen', enableFullscreen);

    if (enableFullscreen && document.documentElement.requestFullscreen) {
      const isAlreadyFull = !!document.fullscreenElement;
      if (!isAlreadyFull) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }

    if (data.autoLandscape && screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }

  function showSmartDevicePrompt(force = false) {
    const shouldShow = force || isPhoneDevice();
    const overlay = document.getElementById('device-choice-overlay');
    if (!overlay || !shouldShow) return;

    overlay.classList.remove('hidden');
    const phoneBtn = document.getElementById('device-choice-phone');
    const desktopBtn = document.getElementById('device-choice-desktop');

    phoneBtn?.addEventListener('click', () => {
      set('mobileFullscreen', true);
      set('autoLandscape', true);
      requestMobileGamePresentation();
      overlay.classList.add('hidden');
    }, { once: true });

    desktopBtn?.addEventListener('click', () => {
      set('mobileFullscreen', false);
      set('autoLandscape', false);
      document.body.classList.remove('mobile-fullscreen');
      overlay.classList.add('hidden');
    }, { once: true });
  }

  // ─── SFX ──────────────────────────────────────────────────
  function toggleSFX(on) {
    set('sfx', on);
    AudioManager.toggleSFX(on);
    document.getElementById('sfx-on')?.classList.toggle('active', on);
    document.getElementById('sfx-off')?.classList.toggle('active', !on);
  }

  // ─── Audio Sliders ────────────────────────────────────────
  function setVolMenu(v) {
    const val = parseFloat(v);
    set('volMenu', val);
    AudioManager.setMenuVolume(val);
    if (document.getElementById('val-vol-menu')) {
      document.getElementById('val-vol-menu').textContent = Math.round(val * 100) + '%';
    }
  }
  function setVolGame(v) {
    const val = parseFloat(v);
    set('volGame', val);
    AudioManager.setGameMusicVolume(val);
    if (document.getElementById('val-vol-game')) {
      document.getElementById('val-vol-game').textContent = Math.round(val * 100) + '%';
    }
  }
  function setVolRain(v) {
    const val = parseFloat(v);
    set('volRain', val);
    AudioManager.setRainVolumeGlobal(val);
    if (document.getElementById('val-vol-rain')) {
      document.getElementById('val-vol-rain').textContent = Math.round(val * 100) + '%';
    }
  }
  function setVolThunder(v) {
    const val = parseFloat(v);
    set('volThunder', val);
    AudioManager.setThunderVolumeGlobal(val);
    if (document.getElementById('val-vol-thunder')) {
      document.getElementById('val-vol-thunder').textContent = Math.round(val * 100) + '%';
    }
  }

  // ─── Quality ──────────────────────────────────────────────
  function setQuality(level) {
    set('quality', level);
    if (window.Engine) Engine.setQuality(level);
    ['low', 'medium', 'high'].forEach(q => {
      document.getElementById(`q-${q === 'medium' ? 'med' : q}`)
        ?.classList.toggle('active', q === level);
    });
    _updateGraphicsPreviewState();
  }

  // ─── Tabs ────────────────────────────────────────────────
  function showTab(tabId) {
    const tabs = ['gameplay', 'audio', 'controls', 'graphics'];
    tabs.forEach(t => {
      document.getElementById(`settings-${t}`)?.classList.add('hidden');
    });
    document.getElementById(`settings-${tabId}`)?.classList.remove('hidden');

    // Update buttons
    const btns = document.querySelectorAll('.settings-tab-btn');
    btns.forEach(btn => {
      const active = btn.getAttribute('onclick')?.includes(`'${tabId}'`);
      btn.classList.toggle('active', !!active);
    });

    if (tabId === 'graphics') {
      setTimeout(_initGraphicsPreview, 50);
    } else {
      _disposeGraphicsPreview();
    }
  }

  // ─── Controls ─────────────────────────────────────────────
  function setSensitivity(val) {
    const num = parseFloat(val);
    set('sensitivity', num);
    const el = document.getElementById('range-sens-val');
    if (el) el.textContent = num.toFixed(1) + 'x';
  }

  function setHaptic(on) {
    set('haptic', on);
    document.getElementById('haptic-on')?.classList.toggle('active', on);
    document.getElementById('haptic-off')?.classList.toggle('active', !on);
    if (window.TelegramAPI) TelegramAPI.haptic(on ? 'light' : 'none');
  }

  // ─── Graphics Extra ───────────────────────────────────────
  function toggleAA(on) {
    set('antialiasing', on);
    document.getElementById('aa-on')?.classList.toggle('active', on);
    document.getElementById('aa-off')?.classList.toggle('active', !on);
    setQuality(data.quality);
    _updateGraphicsPreviewState();
  }

  function toggleShadows(on) {
    set('shadows', on);
    save();
    document.getElementById('shadows-on')?.classList.toggle('active', on);
    document.getElementById('shadows-off')?.classList.toggle('active', !on);
    if (window.Engine) Engine.setShadows(on);
    _updateGraphicsPreviewState();
  }

  function toggleGrass(on) {
    set('grass', on);
    save();
    document.getElementById('grass-on')?.classList.toggle('active', on);
    document.getElementById('grass-off')?.classList.toggle('active', !on);
    if (window.MazeRenderer && typeof window.MazeRenderer.setGrass === 'function') {
      window.MazeRenderer.setGrass(on);
    }
    _updateGraphicsPreviewState();
  }

  function toggleRain(on) {
    set('rain', on);
    save();
    document.getElementById('rain-on')?.classList.toggle('active', on);
    document.getElementById('rain-off')?.classList.toggle('active', !on);
    if (window.WeatherSystem && typeof window.WeatherSystem.toggleRain === 'function') {
      window.WeatherSystem.toggleRain(on);
    }
    _updateGraphicsPreviewState();
  }

  // ─── Live 3D Graphics Preview Scene ────────────────────────
  let _gPreview = null;

  async function _initGraphicsPreview() {
    const container = document.getElementById('graphics-preview-canvas-container');
    if (!container) return;

    _disposeGraphicsPreview();

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 230;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.04);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);
    camera.position.set(2.8, 2.2, 4.2);
    camera.lookAt(0, 1.1, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: (data.antialiasing !== false),
      powerPreference: 'high-performance',
      alpha: false
    });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = (data.shadows !== false);
    renderer.shadowMap.type = (data.quality === 'high') ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 1. Ambient & Hemisphere Light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.6);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // 2. Main Directional Sunlight (Casting Crisp Maze Shadows)
    const dirLight = new THREE.DirectionalLight(0xfff1dc, 2.8);
    dirLight.position.set(4.5, 7.5, 3.5);
    dirLight.castShadow = (data.shadows !== false);
    dirLight.shadow.mapSize.width  = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near   = 0.5;
    dirLight.shadow.camera.far    = 25;
    dirLight.shadow.camera.left   = -4;
    dirLight.shadow.camera.right  =  4;
    dirLight.shadow.camera.top    =  4;
    dirLight.shadow.camera.bottom = -4;
    dirLight.shadow.bias          = -0.001;
    dirLight.shadow.normalBias    = 0.03;
    scene.add(dirLight);
    scene.add(dirLight.target);

    // 3. Realistic Wall Torch with Dynamic Flickering Flame Light
    const torchLight = new THREE.PointLight(0xff7711, 2.2, 7.0, 1.8);
    torchLight.position.set(-1.75, 2.2, 0.3);
    scene.add(torchLight);

    // Torch Sconce Mesh (Metal Bracket + Wood + Flame)
    const torchGroup = new THREE.Group();
    torchGroup.position.copy(torchLight.position);

    const bracketGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8);
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    bracket.rotation.z = Math.PI / 6;
    torchGroup.add(bracket);

    const flameGeo = new THREE.SphereGeometry(0.12, 12, 12);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa22 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(0.08, 0.22, 0);
    torchGroup.add(flame);
    scene.add(torchGroup);

    // 4. Detailed Maze Floor (Earth/Stone Cobblestone Slab)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const fCtx = floorCanvas.getContext('2d');
    fCtx.fillStyle = '#293548';
    fCtx.fillRect(0, 0, 512, 512);

    // Procedural stone flagstones pattern
    for (let x = 0; x < 512; x += 64) {
      for (let y = 0; y < 512; y += 64) {
        const shade = Math.floor(40 + Math.random() * 25);
        fCtx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
        fCtx.fillRect(x + 2, y + 2, 60, 60);
      }
    }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3, 3);

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.75,
      metalness: 0.15,
      color: 0xddeeff
    });
    const floorGeo = new THREE.BoxGeometry(6.5, 0.2, 6.5);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.1;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // 5. Maze Walls (Stone Castle Blocks)
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wCtx = wallCanvas.getContext('2d');
    wCtx.fillStyle = '#1e293b';
    wCtx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 40) {
      const offset = (Math.floor(y / 40) % 2) * 45;
      for (let x = -45; x < 512; x += 90) {
        const bri = Math.floor(45 + Math.random() * 30);
        wCtx.fillStyle = `rgb(${bri + 5}, ${bri + 10}, ${bri + 20})`;
        wCtx.fillRect(x + offset + 2, y + 2, 86, 36);
      }
    }
    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.repeat.set(2, 2);

    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.8,
      metalness: 0.1,
      color: 0xffffff
    });

    const mazeSlice = new THREE.Group();

    // Left Wall
    const leftWallGeo = new THREE.BoxGeometry(0.6, 3.4, 4.8);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.position.set(-1.8, 1.7, 0.4);
    leftWall.castShadow = (data.shadows !== false);
    leftWall.receiveShadow = true;
    mazeSlice.add(leftWall);

    // Back Wall
    const backWallGeo = new THREE.BoxGeometry(4.2, 3.4, 0.6);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0.6, 1.7, -1.8);
    backWall.castShadow = (data.shadows !== false);
    backWall.receiveShadow = true;
    mazeSlice.add(backWall);

    // Corner Stone Pillar
    const pillarGeo = new THREE.BoxGeometry(0.8, 3.6, 0.8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.2 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(-1.8, 1.8, -1.8);
    pillar.castShadow = (data.shadows !== false);
    pillar.receiveShadow = true;
    mazeSlice.add(pillar);

    // Scattered Floor Rocks
    for (let i = 0; i < 6; i++) {
      const rGeo = new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.08, 0);
      const rMesh = new THREE.Mesh(rGeo, pillarMat);
      rMesh.position.set(-1.2 + Math.random() * 2.2, 0.06, -1.0 + Math.random() * 2.0);
      rMesh.rotation.set(Math.random(), Math.random(), Math.random());
      rMesh.castShadow = (data.shadows !== false);
      rMesh.receiveShadow = true;
      mazeSlice.add(rMesh);
    }

    // 5b. 3D Grass Tufts on Preview Floor
    const grassGroup = new THREE.Group();
    grassGroup.name = 'PreviewGrass';
    const bladeGeo = new THREE.ConeGeometry(0.035, 0.35, 4);
    bladeGeo.translate(0, 0.175, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.6,
      metalness: 0.05
    });

    for (let g = 0; g < 22; g++) {
      const cluster = new THREE.Group();
      const cx = -1.3 + Math.random() * 2.6;
      const cz = -1.3 + Math.random() * 2.6;
      cluster.position.set(cx, 0, cz);
      for (let b = 0; b < 6; b++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.rotation.y = (b / 6) * Math.PI * 2 + Math.random() * 0.4;
        blade.rotation.z = (Math.random() - 0.5) * 0.4;
        const sc = 0.7 + Math.random() * 0.6;
        blade.scale.set(sc, sc, sc);
        cluster.add(blade);
      }
      grassGroup.add(cluster);
    }
    grassGroup.visible = (data.grass !== false);
    scene.add(grassGroup);

    // 5c. Preview Rain Drops
    const pRainGeo = new THREE.BufferGeometry();
    const pRainCount = 180;
    const pRainPos = new Float32Array(pRainCount * 3);
    for (let r = 0; r < pRainCount * 3; r += 3) {
      pRainPos[r] = (Math.random() - 0.5) * 6;
      pRainPos[r + 1] = Math.random() * 4.5;
      pRainPos[r + 2] = (Math.random() - 0.5) * 6;
    }
    pRainGeo.setAttribute('position', new THREE.BufferAttribute(pRainPos, 3));
    const pRainMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.09,
      transparent: true,
      opacity: 0.65
    });
    const previewRain = new THREE.Points(pRainGeo, pRainMat);
    previewRain.visible = (data.rain !== false);
    scene.add(previewRain);

    scene.add(mazeSlice);

    // 6. Interactive Drag Orbit Controls
    let isDragging = false;
    let prevMouseX = 0;
    let cameraAngle = 0.6;
    let cameraPitch = 0.4;
    let cameraDist = 4.8;

    function updateCam() {
      const cx = Math.sin(cameraAngle) * Math.cos(cameraPitch) * cameraDist;
      const cy = Math.sin(cameraPitch) * cameraDist + 0.6;
      const cz = Math.cos(cameraAngle) * Math.cos(cameraPitch) * cameraDist;
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 1.1, 0);
    }
    updateCam();

    function onPointerDown(e) {
      isDragging = true;
      prevMouseX = (e.touches ? e.touches[0].clientX : e.clientX);
    }
    function onPointerMove(e) {
      if (!isDragging) return;
      const clientX = (e.touches ? e.touches[0].clientX : e.clientX);
      const dx = clientX - prevMouseX;
      prevMouseX = clientX;
      cameraAngle -= dx * 0.012;
      updateCam();
    }
    function onPointerUp() { isDragging = false; }

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onPointerDown);
    domEl.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);

    _gPreview = {
      scene, camera, renderer, dirLight, torchLight,
      mazeSlice, floorMesh, leftWall, backWall,
      grassGroup, previewRain, pRainGeo,
      model: null, mixer: null, frameId: null,
      domEl, cleanupListeners: () => {
        domEl.removeEventListener('mousedown', onPointerDown);
        domEl.removeEventListener('touchstart', onPointerDown);
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchend', onPointerUp);
      }
    };

    // 7. Load & Animate Character
    try {
      const entry = await CharacterManager.load('hero_gpreview', 'characters/models/female/female_1.glb');
      const cloneFn = (window.SkeletonUtils && window.SkeletonUtils.clone) || (THREE.SkeletonUtils && THREE.SkeletonUtils.clone);
      const model = cloneFn ? cloneFn(entry.model) : entry.model.clone();

      model.position.set(0, 0, 0);
      model.rotation.y = 0.4;

      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow = (data.shadows !== false);
          child.receiveShadow = true;
        }
      });
      scene.add(model);
      _gPreview.model = model;

      const mixer = new THREE.AnimationMixer(model);
      _gPreview.mixer = mixer;

      const animList = entry.animations || entry.gltf?.animations || [];
      const idle = animList.find(a => a.name.toLowerCase().includes('idle'));
      if (idle) mixer.clipAction(idle).play();
      else if (animList[0]) mixer.clipAction(animList[0]).play();

    } catch (err) {
      console.warn('[Settings Maze Preview] Model load fallback:', err);
    }

    _updateGraphicsPreviewState();

    let lastTime = performance.now();
    let timeAcc = 0;
    function animate() {
      if (UI.getCurrent() !== 'settings') {
        _disposeGraphicsPreview();
        return;
      }
      _gPreview.frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      timeAcc += delta;

      // Realistic torch flicker
      if (torchLight) {
        torchLight.intensity = 2.0 + Math.sin(timeAcc * 14.0) * 0.35 + Math.sin(timeAcc * 27.0) * 0.2;
      }

      // Rain animation in preview
      if (previewRain && previewRain.visible && pRainGeo) {
        const arr = pRainGeo.attributes.position.array;
        for (let r = 0; r < pRainCount * 3; r += 3) {
          arr[r + 1] -= delta * 12.0;
          if (arr[r + 1] < 0) arr[r + 1] += 4.5;
        }
        pRainGeo.attributes.position.needsUpdate = true;
      }

      // Gentle auto-rotation when not dragging
      if (!isDragging) {
        cameraAngle += delta * 0.15;
        updateCam();
      }

      if (_gPreview.mixer) _gPreview.mixer.update(delta);

      renderer.render(scene, camera);
    }
    animate();
  }

  function _updateGraphicsPreviewState() {
    if (!_gPreview) return;

    const isLow = data.quality === 'low';
    const isMed = data.quality === 'medium';
    const isHigh = data.quality === 'high';

    // 1. Live Pixel Ratio & Quality
    const pr = isLow ? 0.75 : (isMed ? 1.0 : Math.min(window.devicePixelRatio || 1, 2));
    _gPreview.renderer.setPixelRatio(pr);
    _gPreview.renderer.shadowMap.type = isHigh ? THREE.PCFSoftShadowMap : (isMed ? THREE.PCFShadowMap : THREE.BasicShadowMap);

    // 2. Real-time Shadows Toggling across Maze Slice
    const shadowsOn = (data.shadows !== false);
    _gPreview.renderer.shadowMap.enabled = shadowsOn;
    _gPreview.renderer.shadowMap.needsUpdate = true;
    _gPreview.dirLight.castShadow = shadowsOn;

    if (_gPreview.mazeSlice) {
      _gPreview.mazeSlice.traverse(node => {
        if (node.isMesh) {
          node.castShadow = shadowsOn;
          if (node.material) node.material.needsUpdate = true;
        }
      });
    }

    if (_gPreview.model) {
      _gPreview.model.traverse(node => {
        if (node.isMesh) {
          node.castShadow = shadowsOn;
          if (node.material) node.material.needsUpdate = true;
        }
      });
    }

    if (_gPreview.floorMesh) {
      _gPreview.floorMesh.receiveShadow = shadowsOn;
      if (_gPreview.floorMesh.material) _gPreview.floorMesh.material.needsUpdate = true;
    }

    // 3. Live Grass & Rain Toggling in Preview
    if (_gPreview.grassGroup) {
      _gPreview.grassGroup.visible = (data.grass !== false);
    }
    if (_gPreview.previewRain) {
      _gPreview.previewRain.visible = (data.rain !== false);
    }

    // 4. Update Live Status Badge
    const statusEl = document.getElementById('graphics-preview-status');
    if (statusEl) {
      const qText = isLow ? 'جودة منخفضة' : (isMed ? 'جودة متوسطة' : 'جودة فائقة');
      const shText = shadowsOn ? 'ظلال ☀️' : 'بدون ظلال 🌑';
      const grText = data.grass !== false ? 'حشائش 🌱' : 'أرض ملساء';
      const rnText = data.rain !== false ? 'مطر 🌧️' : 'جو صحو ☀️';
      statusEl.textContent = `${qText} • ${shText} • ${grText} • ${rnText}`;
    }
  }

  function _disposeGraphicsPreview() {
    if (!_gPreview) return;
    if (_gPreview.cleanupListeners) _gPreview.cleanupListeners();
    if (_gPreview.frameId) cancelAnimationFrame(_gPreview.frameId);
    if (_gPreview.renderer) {
      _gPreview.renderer.dispose();
      _gPreview.renderer.forceContextLoss();
      if (_gPreview.renderer.domElement) _gPreview.renderer.domElement.remove();
    }
    _gPreview = null;
  }

  // ─── Apply all on startup ─────────────────────────────────
  function _applyAll() {
    AudioManager.toggleSFX(data.sfx);

    // Apply gameplay/camera
    setCameraMode(data.cameraMode);

    // Apply graphics
    if (window.Engine) {
      Engine.setQuality(data.quality);
      Engine.setShadows(data.shadows);
    }

    // Apply Grass & Rain to active systems
    if (window.MazeRenderer && typeof window.MazeRenderer.setGrass === 'function') {
      window.MazeRenderer.setGrass(data.grass !== false);
    }
    if (window.WeatherSystem && typeof window.WeatherSystem.toggleRain === 'function') {
      window.WeatherSystem.toggleRain(data.rain !== false);
    }

    // Update Quality Buttons UI
    ['low', 'medium', 'high'].forEach(q => {
      document.getElementById(`q-${q === 'medium' ? 'med' : q}`)
        ?.classList.toggle('active', q === data.quality);
    });

    // Apply individual volumes
    AudioManager.setMenuVolume(data.volMenu);
    AudioManager.setGameMusicVolume(data.volGame);
    AudioManager.setRainVolumeGlobal(data.volRain);
    AudioManager.setThunderVolumeGlobal(data.volThunder);

    if (document.getElementById('range-sens-val')) {
       document.getElementById('range-sens-val').textContent = data.sensitivity.toFixed(1) + 'x';
       document.getElementById('setting-sens').value = data.sensitivity;
    }

    // Update Audio Sliders UI if they exist
    const sliders = {
      'setting-vol-menu': data.volMenu,
      'setting-vol-game': data.volGame,
      'setting-vol-rain': data.volRain,
      'setting-vol-thunder': data.volThunder
    };
    for (const [id, val] of Object.entries(sliders)) {
      const el = document.getElementById(id);
      if (el) el.value = val;
      const valEl = document.getElementById('val-' + id.replace('setting-', ''));
      if (valEl) valEl.textContent = Math.round(val * 100) + '%';
    }

    // Update SFX UI
    document.getElementById('sfx-on')?.classList.toggle('active', data.sfx);
    document.getElementById('sfx-off')?.classList.toggle('active', !data.sfx);

    // Update UI states
    _updateLanguageUI();
    document.getElementById('haptic-on')?.classList.toggle('active', data.haptic);
    document.getElementById('haptic-off')?.classList.toggle('active', !data.haptic);
    document.getElementById('aa-on')?.classList.toggle('active', data.antialiasing);
    document.getElementById('aa-off')?.classList.toggle('active', !data.antialiasing);
    document.getElementById('shadows-on')?.classList.toggle('active', data.shadows !== false);
    document.getElementById('shadows-off')?.classList.toggle('active', data.shadows === false);
    document.getElementById('grass-on')?.classList.toggle('active', data.grass !== false);
    document.getElementById('grass-off')?.classList.toggle('active', data.grass === false);
    document.getElementById('rain-on')?.classList.toggle('active', data.rain !== false);
    document.getElementById('rain-off')?.classList.toggle('active', data.rain === false);
  }

  return {
    load, save, get, set, applyToGame: _applyAll, setLanguage, setCameraMode, toggleSFX, setQuality,
    showTab, setSensitivity, setHaptic, toggleAA, toggleShadows, toggleGrass, toggleRain,
    setVolMenu, setVolGame, setVolRain, setVolThunder,
    confirmSave, resetToDefaults,
    isPhoneDevice,
    setMobileFullscreen,
    setAutoLandscape,
    requestMobileGamePresentation,
    showSmartDevicePrompt
  };
})();
