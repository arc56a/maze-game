/**
 * Game.js — Bootstrap & wiring
 * Entry point: initializes all systems and connects UI buttons
 */

(async function GameInit() {
  console.log('🌀 Maze 3D — Starting...');

  if (window.LevelAutoLoader && typeof window.LevelAutoLoader.scanAndRegister === 'function') {
    try {
      await window.LevelAutoLoader.scanAndRegister();
      console.log('[Game] Auto-discovered level scripts.');
    } catch (err) {
      console.warn('[Game] Auto level discovery failed:', err);
    }
  }

  // ─── 1. Engine ────────────────────────────────────────────
  Engine.init();
  InputManager.init();
  AudioManager.init();
  Settings.load();
  TelegramAPI.init();
  Joystick.init();
  UI.updateMenuPlayerMini();

  function getFirstLevelIndex() {
    const registered = LevelManager.getRegisteredLevels ? LevelManager.getRegisteredLevels() : [];
    if (!registered.length) return null;
    return registered.reduce((min, { index }) => Math.min(min, index), Number.MAX_SAFE_INTEGER);
  }

  // ─── 2. Menu buttons ──────────────────────────────────────
  document.getElementById('btn-play')?.addEventListener('click', () => {
    const first = getFirstLevelIndex();
    if (first === null) {
      UI.toast('لا توجد مراحل مضافة بعد. ضع ملف stage.js داخل مجلد مراحل أو لفل', 'info');
      return;
    }
    if (window.UI && typeof UI.requestFullscreenAndLandscape === 'function') {
      UI.requestFullscreenAndLandscape();
    }
    LevelManager.load(first);
    TelegramAPI.haptic('medium');
  });

  document.getElementById('btn-levels')?.addEventListener('click', () => {
    UI.showScreen('levels');
    TelegramAPI.haptic('light');
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    UI.showScreen('settings');
  });

  document.getElementById('btn-account')?.addEventListener('click', () => {
    UI.showScreen('account');
  });

  document.getElementById('btn-about')?.addEventListener('click', () => {
    UI.showScreen('about');
  });

  // ─── 3. In-game buttons ───────────────────────────────────
  document.getElementById('btn-cam-toggle')?.addEventListener('click', () => {
    CameraController.toggle();
    TelegramAPI.haptic('light');
  });

  document.getElementById('btn-pause')?.addEventListener('click', () => {
    window.togglePause();
  });

  document.getElementById('btn-mission')?.addEventListener('click', () => {
    HUD.toggleMission();
  });

  document.getElementById('btn-resume')?.addEventListener('click', () => {
    window.togglePause(false);
  });

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    window.togglePause(false);
    LevelManager.restart();
  });

  document.getElementById('btn-quit')?.addEventListener('click', () => {
    if (typeof WeatherSystem !== 'undefined') WeatherSystem.setWeather('clear');
    Engine.stop();
    AudioManager.stopMusic();
    window.togglePause(false);
    UI.showScreen('menu');
  });

  document.getElementById('btn-settings-ingame')?.addEventListener('click', () => {
    UI.showScreen('settings');
    // Keep game paused but hide pause menu overlay
    const el = document.getElementById('pause-menu');
    el?.classList.add('hidden');
  });

  document.getElementById('btn-save-progress')?.addEventListener('click', () => {
    // Logic for saving progress can be added here
    if (window.UI) UI.toast('تم حفظ التقدم! 💾', 'success');
  });

  document.getElementById('btn-storage')?.addEventListener('click', () => {
    // Logic for storage/load can be added here
    if (window.UI) UI.toast('خيار التخزين قريباً 📦', 'info');
  });

  // ─── 4. Win / Lose buttons ────────────────────────────────
  document.getElementById('btn-next-level')?.addEventListener('click', () => {
    LevelManager.nextLevel();
    TelegramAPI.haptic('medium');
  });

  document.getElementById('btn-win-menu')?.addEventListener('click', () => {
    AudioManager.stopMusic();
    UI.showScreen('menu');
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    LevelManager.restart();
    TelegramAPI.haptic('medium');
  });

  document.getElementById('btn-lose-menu')?.addEventListener('click', () => {
    AudioManager.stopMusic();
    UI.showScreen('menu');
  });

  // ─── 6. Pause system ──────────────────────────────────────
  let _paused = false;
  window.togglePause = function(force) {
    _paused = force !== undefined ? force : !_paused;
    const el = document.getElementById('pause-menu');
    el?.classList.toggle('hidden', !_paused);

    if (_paused) {
      // Populate pause menu stats
      const lvl = LevelManager.getCurrentIndex();
      const collected = LevelManager.getKeysCollected();
      const total = LevelManager.getTotalKeys();

      const lvlVal = document.getElementById('pause-level-val');
      const keysVal = document.getElementById('pause-keys-val');

      if (lvlVal) lvlVal.textContent = lvl;
      if (keysVal) keysVal.textContent = `${collected}/${total}`;

      Engine.stop();
      TelegramAPI.haptic('light');
    } else {
      Engine.start();
    }
  }

  // Handle Escape key using the global function
  InputManager.on('keydown', code => {
    if (code === 'Escape') window.togglePause();
    if (code === 'KeyC') CameraController.toggle();
    if (code === 'KeyR' && UI.getCurrent() === 'game') LevelManager.restart();
  });

  // ─── 7. Prevent context menu on canvas ────────────────────
  document.getElementById('game-canvas')?.addEventListener('contextmenu', e => e.preventDefault());

  // ─── 8. Show menu / Profile ──────────────────────────────
  ProfileUI.init();

  // ─── 9. Handle Menu Audio ─────────────────────────────────
  // Browsers block audio until first user interaction
  const menuAudio = document.getElementById('menu-audio');
  if (menuAudio) {
    menuAudio.volume = 0.5;
    const startAudio = () => {
      menuAudio.play().catch(e => console.log("Audio play failed:", e));
      window.removeEventListener('click', startAudio);
      window.removeEventListener('touchstart', startAudio);
    };
    window.addEventListener('click', startAudio);
    window.addEventListener('touchstart', startAudio);
  }

  console.log('✅ Maze 3D — Ready!');

})();
