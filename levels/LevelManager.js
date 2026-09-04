/**
 * LevelManager.js
 * Orchestrates level loading, key collection, timer, win/lose
 */

const LevelManager = (() => {
  // Level definitions registry
  const levelDefs = {};
  const levelOrder = [];

  // Runtime
  let currentLevel  = null;
  let currentIndex  = 1;
  let keys          = [];    // { col, row, worldX, worldZ, mesh, collected }
  let keysCollected = 0;
  let timer         = 0;
  let timerRunning  = false;
  let saveData      = {};

  // ─── Register levels ──────────────────────────────────────
  function register(index, def, overwrite = false) {
    if (levelDefs[index] && !overwrite) {
      console.warn('[LevelManager] Skipping duplicate level index:', index, 'existing level kept:', levelDefs[index].name || index);
      return;
    }

    levelDefs[index] = def;
    if (!levelOrder.includes(index)) levelOrder.push(index);
    levelOrder.sort((a, b) => a - b);
  }

  // ─── Load level ───────────────────────────────────────────
  async function load(index) {
    const def = levelDefs[index];
    if (!def) {
      console.error('[LevelManager] Level not found:', index);
      UI.toast(`المرحلة رقم ${index} غير مسجلة بعد`, 'error');
      return;
    }

    const startTime = Date.now();
    currentIndex = index;
    currentLevel = def;
    keysCollected = 0;
    timer = 0;
    timerRunning = false;

    UI.showScreen('loading');
    UI.setLoadingProgress(10);
    UI.updateLoadingTip();
    UI.setLoadingText('جاري تهيئة الموارد...');

    try {
      // 1. Reset level-specific asset cache & clear loops early
      AssetLoader.reset();
      Engine.clearUpdates();
      SceneManager.clearScene(false);
      PlayerController.dispose();

      // Clear any spatial audio from previous level
      if (typeof AudioManager !== 'undefined' && AudioManager.clearSpatial) {
        AudioManager.clearSpatial();
      }

      // 2. Load Core Audio & Props
      const promises = [
        AudioManager.load('walk_1', 'assets/sounds/walk_1.wav'),
        PropsManager.loadProps(),
        MazeRenderer.loadPBRTextures(def.theme || 'forest')
      ];
      if (def.music) {
        promises.push(AudioManager.load(def.music, `assets/sounds/${def.music}.mp3`));
      }
      if (def.keys > 0) {
        promises.push(AssetLoader.loadGLTF('assets/missions/Key1.glb', true));
      }

      // Load custom spatial sounds
      if (def.sounds && def.sounds.length > 0) {
        def.sounds.forEach((s, idx) => {
          if (s.audioData) {
            promises.push(AudioManager.load(`spatial_${s.id || idx}`, s.audioData));
          }
        });
      }

      await Promise.all(promises);

      UI.setLoadingProgress(35);
      UI.setLoadingText('جاري بناء عالم المتاهة...');

      // 3. Prepare Maze / Freeform data
      let mazeData;
      if (def.isStatic) {
        // Professional Studio Level (Freeform) - Normalize V2 data idempotently
        if (def.version === '2.0' && !def._normalizedV2) {
          def._normalizedV2 = true;
          const assets = def.assets || { textures: [], models: [] };
          const getAsset = (ref, type) => {
            if (!ref || typeof ref !== 'string' || !ref.startsWith('@')) return ref;
            const idx = parseInt(ref.substring(2));
            return type === 'textures' ? assets.textures[idx] : assets.models[idx];
          };

          def.freeWalls = (def.freeWalls || []).map(w => ({
            id: w.i ?? w.id,
            x: w.x ?? 0,
            y: w.y ?? 0,
            z: w.z ?? 0,
            rotX: w.rx ?? w.rotX ?? 0,
            rotY: w.ry ?? w.rotY ?? 0,
            rotZ: w.rz ?? w.rotZ ?? 0,
            width: w.w ?? w.width ?? 1,
            thickness: w.t ?? w.thickness ?? 0.4,
            height: w.h ?? w.height ?? 4.5,
            scale: w.s ?? w.scale ?? 1.0,
            variant: w.v || w.variant || 'standard',
            topVariant: w.tv || w.topVariant || 'none',
            hasPillars: !!(w.hp ?? w.hasPillars),
            hasPanels: !!(w.hpa ?? w.hasPanels),
            hasCarving: !!(w.hc ?? w.hasCarving),
            customTex: getAsset(w.tx ?? w.customTex, 'textures'),
            backTex: getAsset(w.bx ?? w.backTex, 'textures'),
            decorTex: getAsset(w.dtx ?? w.decorTex, 'textures'),
            customModel: getAsset(w.cm ?? w.customModel, 'models'),
            backCustomModel: getAsset(w.bcm ?? w.backCustomModel, 'models'),
            doubleSided: w.ds ?? w.doubleSided ?? true,
            texRepeatX: w.rxp ?? w.texRepeatX ?? 1,
            texRepeatY: w.ryp ?? w.texRepeatY ?? 1
          }));

          def.freeFloors = (def.freeFloors || []).map(f => ({
            id: f.i ?? f.id,
            x: f.x ?? 0,
            y: f.y ?? 0,
            z: f.z ?? 0,
            rotX: f.rx ?? f.rotX ?? 0,
            rotY: f.ry ?? f.rotY ?? 0,
            rotZ: f.rz ?? f.rotZ ?? 0,
            width: f.w ?? f.width ?? 1,
            depth: f.d ?? f.depth ?? 1,
            thickness: f.t ?? f.thickness ?? 0.4,
            scale: f.s ?? f.scale ?? 1.0,
            customTex: getAsset(f.tx ?? f.customTex, 'textures'),
            customModel: getAsset(f.cm ?? f.customModel, 'models'),
            isCeiling: f.ic ?? f.isCeiling ?? false,
            texRepeatX: f.rxp ?? f.texRepeatX ?? 1,
            texRepeatY: f.ryp ?? f.texRepeatY ?? 1
          }));

          def.customModels = (def.customModels || []).map(m => ({
            id: m.i ?? m.id,
            modelData: getAsset(m.d ?? m.modelData, 'models'),
            x: m.x ?? 0,
            y: m.y ?? 0,
            z: m.z ?? 0,
            rotX: m.rx ?? m.rotX ?? 0,
            rotY: m.ry ?? m.rotY ?? 0,
            rotZ: m.rz ?? m.rotZ ?? 0,
            scale: m.s ?? m.scale ?? 1.0
          }));

          def.props = (def.props || []).map(p => ({
            id: p.i ?? p.id,
            type: p.ty ?? p.type,
            x: p.x ?? 0,
            y: p.y ?? 0,
            z: p.z ?? 0,
            rotY: p.ry ?? p.rotY ?? 0,
            scale: p.s ?? p.scale ?? 1.0,
            variant: p.v ?? p.variant ?? 'default',
            customTex: p.customTex ?? getAsset(p.tx, 'textures'),
            texRepeatX: p.rxp ?? p.texRepeatX ?? 1,
            texRepeatY: p.ryp ?? p.texRepeatY ?? 1
          }));

          def.sounds = (def.sn || def.sounds || []).map(s => ({
            id: s.i ?? s.id,
            x: s.x ?? 0,
            y: s.y ?? 0,
            z: s.z ?? 0,
            audioData: getAsset(s.d ?? s.audioData, 'textures'), // Re-using texture index for simplicity or if it was exported there
            distance: s.d ?? s.distance ?? 10,
            volume: s.v ?? s.volume ?? 0.5
          }));

          def.triggers = (def.tr || def.triggers || []).map(t => ({
            id: t.i ?? t.id,
            x: t.x ?? 0,
            y: t.y ?? 0,
            z: t.z ?? 0,
            text: t.t ?? t.text ?? '',
            distance: t.d ?? t.distance ?? 2.5,
            once: t.o ?? t.once ?? true
          }));
        }

        mazeData = {
          cols: def.cols,
          rows: def.rows,
          grid: [],
          levelDef: def
        };
      } else {
        // Procedural Maze
        mazeData = MazeGenerator.generate(def.cols, def.rows, def.seed);
        mazeData.levelDef = def;
      }

      UI.setLoadingProgress(50);
      UI.setLoadingText('جاري ضبط الإضاءة والبيئة...');

      // 4. Setup Outdoor Sky, Lighting & Player
      await SceneManager.setupLighting(def.theme || 'forest', def.startHour ?? 8.0);

      if (def.isStatic && def.spawn) {
        await PlayerController.init(0, 0, def.spawn);
      } else {
        const { start } = MazeGenerator.getStartExit(def.cols, def.rows, def);
        await PlayerController.init(start.col, start.row);
      }

      UI.setLoadingProgress(70);
      UI.setLoadingText('جاري بناء عالم المتاهة وتجهيز الخامات...');

      // 5. Build 3D Maze & Props asynchronously with full texture preloading
      await MazeRenderer.build(mazeData, def.theme || 'forest');

      UI.setLoadingProgress(85);
      UI.setLoadingText('جاري وضع العناصر والتصادم...');

      // 6. Setup Collision
      if (def.isStatic) {
        MazeCollision.setFreeformObjects(def.freeWalls || [], def.freeFloors || []);
      } else {
        MazeCollision.setMaze(mazeData.grid, def.cols, def.rows);
        MazeCollision.setFreeformObjects([], []);
      }

      // 7. Place Keys
      if (def.isStatic) {
        _placeKeysStatic((def.props || []).filter(p => (p.type || p.ty) === 'key'));
      } else {
        _placeKeys(mazeData, def.keys || 0, def.seed);
      }

      // 8. Camera, Weather & HUD
      const camMode = Settings.get('cameraMode') || 'third';
      CameraController.init(camMode);

      if (typeof WeatherSystem !== 'undefined') {
        WeatherSystem.init(
          def.startHour ?? 8.0,
          (def.timeSpeed !== undefined) ? def.timeSpeed : 0.0166,
          def.timeLoop !== false,
          def.rainIntensity ?? 0,
          def.snowIntensity ?? 0,
          def.rainSpeed ?? 1,
          def.snowSpeed ?? 1,
          def.lightningEnabled === true,
          def.fogColor || null,
          def.fogDensity ?? 0
        );
        WeatherSystem.setWeather(def.weather || 'clear');
      }

      // Update Player Controller with level-specific movement settings
      if (window.PlayerController && typeof PlayerController.setMovementParams === 'function') {
        PlayerController.setMovementParams(def.playerSpeed || 2.8, def.playerJumpForce || 8.5);
      }

      Minimap.build(mazeData);
      HUD.setLevel(index);
      HUD.setKeys(0, def.keys || 0);

      // Start spatial sounds
      if (def.sounds && def.sounds.length > 0) {
        def.sounds.forEach((s, idx) => {
          if (s.audioData) {
            AudioManager.playSpatial(`spatial_${s.id || idx}`, s.x, s.y, s.z, {
              distance: s.distance,
              volume: s.volume
            });
          }
        });
      }

      // Apply cinematic exposure
      if (typeof Engine !== 'undefined' && Engine.getRenderer) {
        const renderer = Engine.getRenderer();
        if (renderer) {
          renderer.toneMappingExposure = def.exposure || 1.2;
        }
      }

      // 9. GPU warm-up: compile shaders cleanly with fully loaded meshes
      UI.setLoadingProgress(90);
      UI.setLoadingText('جاري تحسين استقرار العرض...');
      if (typeof Engine.warmUp === 'function') {
        await Engine.warmUp(CameraController.getActive());
      }

      // 10. Smooth realistic minimum duration (700ms total)
      const MIN_LOAD_TIME = 700;
      const elapsedNow = Date.now() - startTime;
      if (elapsedNow < MIN_LOAD_TIME) {
        await new Promise(r => setTimeout(r, MIN_LOAD_TIME - elapsedNow));
      }

      // 11. Register Game Loop
      Engine.onUpdate((delta, elapsed) => _gameLoop(delta, elapsed, mazeData));

      // 12. Final Start
      UI.setLoadingProgress(100);
      UI.setLoadingText('جاهز للمغامرة!');
      await new Promise(r => setTimeout(r, 200));

      Engine.start();
      setTimeout(() => { timerRunning = true; }, 100);

      // Smooth transition to game screen
      setTimeout(() => {
        UI.showScreen('game');
        AudioManager.resume();
        if (def.music) AudioManager.playMusic(def.music);
      }, 300);

      console.log(`[LevelManager] Level ${index} loaded successfully in ${Date.now() - startTime}ms ✓`);
    } catch (err) {
      console.error('[LevelManager] Critical loading error:', err);
      UI.toast('حدث خطأ أثناء تحميل المرحلة: ' + (err.message || err), 'error');
      setTimeout(() => UI.showScreen('menu'), 1500);
    }
  }

  // ─── Game loop ────────────────────────────────────────────
  function _gameLoop(delta, elapsed, mazeData) {
    if (timerRunning) {
      timer += delta;
      HUD.setTimer(timer);
    }

    PlayerController.update(delta);

    const pos  = PlayerController.getPosition();

    // Update Spatial Audio Listener to follow camera/player
    const activeCam = CameraController.getActive();
    if (activeCam && typeof AudioManager !== 'undefined' && AudioManager.updateListener) {
      AudioManager.updateListener(activeCam);
    }

    // Update Weather System (Rain follows player, lightning flashes)
    if (typeof WeatherSystem !== 'undefined') {
      WeatherSystem.update(delta, pos);
    }

    // ─── Trigger Zones ───
    if (currentLevel.triggers && currentLevel.triggers.length > 0) {
      for (const t of currentLevel.triggers) {
        if (t.fired && t.once) continue;
        const dx = pos.x - t.x;
        const dz = pos.z - t.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < t.distance * t.distance) {
          if (!t.inside) {
            t.inside = true;
            t.fired = true;
            if (t.text && typeof HUD !== 'undefined' && HUD.showMissionToast) {
              HUD.showMissionToast(t.text);
            }
          }
        } else {
          t.inside = false;
        }
      }
    }

    const { exit } = MazeGenerator.getStartExit(mazeData.cols, mazeData.rows, mazeData.levelDef);

    // Key pickups & Detection
    const nearbyItems = MazeCollision.checkPickup(pos, keys, 1.5);
    const nearest = nearbyItems[0]; // Take the first one found

    if (nearest && !nearest.collecting) {
      // Show confirmation prompt if not already showing for this item
      if (currentLevel.nearbyItem !== nearest) {
        currentLevel.nearbyItem = nearest;
        HUD.showPickupPrompt(true, () => _collectKey(nearest), {
          icon: "🗝️",
          title: "لقد وجدت مفتاحاً أسطورياً!",
          sub: "هل تريد التقاطه؟"
        });
      }
    } else {
      // Hide prompt if player moved away from key
      if (currentLevel.nearbyItem && !currentLevel.atExit) {
        HUD.showPickupPrompt(false);
        currentLevel.nearbyItem = null;
      }
    }

    // ─── Win check / Exit Interaction ───
    const isInExitZone = (currentLevel.isStatic && currentLevel.exit)
      ? MazeCollision.isAtExit(pos, currentLevel.exit)
      : MazeCollision.isAtExit(pos, exit);
    const hasAllKeys   = keysCollected >= (currentLevel.keys || 0);

    if (isInExitZone) {
      if (!currentLevel.atExit) {
        currentLevel.atExit = true;
        if (hasAllKeys) {
          HUD.showPickupPrompt(true, () => {
            HUD.updateMissionTask('task-exit-status', true);
            _win();
          }, {
            icon: "🚪",
            title: "باب الخروج",
            sub: "هل تريد الدخول وإنهاء المرحلة؟"
          });
        } else {
          // Feedback that door is locked
          HUD.showPrompt("اجمع كل المفاتيح لفتح هذا الباب! 🔑");
          TelegramAPI.haptic('medium');
        }
      }
    } else {
      // Player walked away from exit
      if (currentLevel.atExit) {
        HUD.showPickupPrompt(false);
        HUD.hidePrompt();
        currentLevel.atExit = false;
      }
    }

    // Minimap update
    Minimap.updatePlayer(pos);
  }

  function _placeKeysStatic(keyProps) {
    keys = [];
    const keyAsset = AssetLoader.get('assets/missions/Key1.glb');

    keyProps.forEach(p => {
      let mesh;
      if (keyAsset) {
        mesh = keyAsset.scene.clone();
        mesh.scale.set(0.5, 0.5, 0.5);
        mesh.rotation.x = Math.PI / 2;
      } else {
        mesh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 24), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
      }

      mesh.position.set(p.x, 1.1, p.z);
      mesh.traverse(n => { if (n.isMesh) { n.castShadow = n.receiveShadow = true; } });
      SceneManager.add(mesh);

      const keyLight = new THREE.PointLight(0xfbbf24, 4, 3);
      keyLight.position.set(p.x, 1.2, p.z);
      SceneManager.add(keyLight);
      mesh.userData.light = keyLight;

      // Animation
      const baseHeight = 1.1;
      Engine.onUpdate((dt, elapsed) => {
        if (!mesh.parent || mesh.userData.collecting) return;
        mesh.rotation.z += dt * 1.5;
        mesh.position.y = baseHeight + Math.sin(elapsed * 2.0) * 0.15;
        if (keyLight) keyLight.position.y = mesh.position.y + 0.1;
      });

      keys.push({ worldX: p.x, worldZ: p.z, mesh, collected: false, collecting: false });
    });
  }

  // ─── Actual Key Collection ───────────────────────────────
  function _collectKey(item) {
    if (item.collecting) return;
    item.collecting = true;
    item.collected = true; // Mark as collected so checkPickup ignores it

    const mesh = item.mesh;
    const light = mesh.userData.light;
    let progress = 0;

    const pullAnim = (dt) => {
      progress += dt * 3.5;

      const targetPos = PlayerController.getPosition();
      targetPos.y += 1.2;

      mesh.position.lerp(targetPos, progress);
      mesh.scale.multiplyScalar(0.92);
      mesh.rotation.y += dt * 30;

      if (light) {
        light.position.copy(mesh.position);
        light.intensity *= 0.9;
      }

      if (progress >= 1.0 || mesh.position.distanceTo(targetPos) < 0.3) {
        SceneManager.remove(mesh);
        if (light) SceneManager.remove(light);
        Engine.offUpdate(pullAnim);
      }
    };
    Engine.onUpdate(pullAnim);

    keysCollected++;
    HUD.setKeys(keysCollected, currentLevel.keys || 0);

    const allKeys = keysCollected >= (currentLevel.keys || 0);
    if (allKeys) HUD.updateMissionTask('task-keys-status', true);

    AudioManager.playPickup();
    TelegramAPI.haptic('medium');
  }

  // ─── Place keys ───────────────────────────────────────────
  function _placeKeys(mazeData, count, seed) {
    keys = [];
    if (count <= 0) return;

    const rng       = _rng(seed + 999);
    // نمرر الـ grid هنا لتمكين التوزيع الذكي في الزوايا
    const positions = MazeGenerator.placeKeys(mazeData.grid, mazeData.cols, mazeData.rows, count, rng);
    const C         = MazeRenderer.CELL_SIZE;
    const grid      = mazeData.grid;

    const keyAsset = AssetLoader.get('assets/missions/Key1.glb');

    positions.forEach(({ col, row }) => {
      const cell = grid[row][col];
      let ox = 0, oz = 0;
      const margin = 1.7;

      const hasN = !(cell & MazeGenerator.N);
      const hasS = !(cell & MazeGenerator.S);
      const hasE = !(cell & MazeGenerator.E);
      const hasW = !(cell & MazeGenerator.W);

      if (hasN && hasW) { ox = -margin; oz = -margin; }
      else if (hasN && hasE) { ox = margin; oz = -margin; }
      else if (hasS && hasW) { ox = -margin; oz = margin; }
      else if (hasS && hasE) { ox = margin; oz = margin; }
      else if (hasN) oz = -margin;
      else if (hasS) oz = margin;
      else if (hasE) ox = margin;
      else if (hasW) ox = -margin;

      const wx = col * C + C / 2 + ox;
      const wz = row * C + C / 2 + oz;

      let mesh;
      if (keyAsset) {
        mesh = keyAsset.scene.clone();
        mesh.scale.set(0.5, 0.5, 0.5); // صغرنا حجم المفتاح ليكون أكثر واقعية
        mesh.rotation.x = Math.PI / 2;
      } else {
        const geo  = new THREE.TorusGeometry(0.2, 0.05, 12, 24);
        const mat  = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 1.5 });
        mesh = new THREE.Mesh(geo, mat);
      }

      mesh.position.set(wx, 1.1, wz);

      // Ensure key mesh casts and receives shadows
      mesh.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      SceneManager.add(mesh);

      const keyLight = new THREE.PointLight(0xfbbf24, 4, 3);
      keyLight.position.set(wx, 1.2, wz);
      SceneManager.add(keyLight);
      mesh.userData.light = keyLight;

      // New Dynamic Animation Logic
      const baseHeight = 1.1;
      Engine.onUpdate((dt, elapsed) => {
        if (!mesh.parent || mesh.userData.collecting) return;

        // الدوران حول نفسه بشكل انسيابي
        mesh.rotation.z += dt * 1.5;

        // حركة الطواف العمودية
        mesh.position.y = baseHeight + Math.sin(elapsed * 2.0) * 0.15;

        if (keyLight) {
          keyLight.position.y = mesh.position.y + 0.1;
          keyLight.intensity = 3 + Math.sin(elapsed * 4) * 2;
        }

        const s = 0.5 + Math.sin(elapsed * 3) * 0.03;
        mesh.scale.set(s, s, s);
      });

      keys.push({ col, row, worldX: wx, worldZ: wz, mesh, collected: false, collecting: false });
    });
  }

  // ─── Win ──────────────────────────────────────────────────
  function _win() {
    timerRunning = false;
    if (typeof WeatherSystem !== 'undefined') WeatherSystem.setWeather('clear');
    Engine.stop();

    const stars = _calcStars(timer, currentLevel.timeGoals);
    _saveProgress(currentIndex, stars, timer);
    AudioManager.playSuccess();

    HUD.showWin();
    setTimeout(() => UI.showScreen('win'), 800);

    document.getElementById('win-time').textContent  = HUD.formatTime(timer);
    document.getElementById('win-stars').textContent = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
    document.getElementById('win-keys').textContent  = `${keysCollected}/${currentLevel.keys || 0}`;
  }

  // ─── Stars ────────────────────────────────────────────────
  function _calcStars(time, goals = [120, 90, 60]) {
    if (time <= goals[2]) return 3;
    if (time <= goals[1]) return 2;
    if (time <= goals[0]) return 1;
    return 1;
  }

  // ─── Save / Load ──────────────────────────────────────────
  function _saveProgress(index, stars, time) {
    try {
      const key  = 'maze3d_progress';
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      const prev = data[index] || { stars: 0, best: Infinity };
      data[index] = {
        stars:    Math.max(prev.stars, stars),
        best:     Math.min(prev.best, time),
        unlocked: true,
      };
      // Unlock next
      data[index + 1] = data[index + 1] || { unlocked: true, stars: 0, best: Infinity };
      localStorage.setItem(key, JSON.stringify(data));
      saveData = data;
    } catch(e) {}
  }

  function loadSaveData() {
    try { saveData = JSON.parse(localStorage.getItem('maze3d_progress') || '{}'); }
    catch(e) { saveData = {}; }
    return saveData;
  }

  function isUnlocked(index) {
    return index === 1 || !!saveData[index]?.unlocked;
  }

  function getStars(index) {
    return saveData[index]?.stars || 0;
  }

  // ─── Restart ──────────────────────────────────────────────
  function restart() { load(currentIndex); }

  function nextLevel() {
    const next = currentIndex + 1;
    if (levelDefs[next]) load(next); else UI.showScreen('menu');
  }

  // ─── Helpers ─────────────────────────────────────────────
  function _rng(seed) {
    let s = seed >>> 0;
    return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return((t^(t>>>14))>>>0)/4294967296; };
  }

  function getCurrentDef()   { return currentLevel; }
  function getCurrentIndex() { return currentIndex; }
  function getTimer()        { return timer; }
  function getKeysCollected() { return keysCollected; }
  function getTotalKeys()    { return currentLevel ? (currentLevel.keys || 0) : 0; }
  function getRegisteredLevels() {
    return levelOrder.map(index => ({ index, def: levelDefs[index] }));
  }

  return {
    register, load, restart, nextLevel,
    loadSaveData, isUnlocked, getStars, getRegisteredLevels,
    getCurrentDef, getCurrentIndex, getTimer,
    getKeysCollected, getTotalKeys,
  };
})();
