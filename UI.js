/**
 * UI.js — Screen & transition manager (Mobile Landscape First)
 */

const UI = (() => {
  let currentScreen = 'menu';
  let lastScreen    = 'menu';

  // ─── Show screen ──────────────────────────────────────────
  function showScreen(name) {
    console.log(`[UI] Switching to screen: ${name}`);
    lastScreen = currentScreen;
    // Hide all
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
    });

    const el = document.getElementById(`screen-${name}`);
    if (!el) {
      console.warn(`[UI] Screen not found: screen-${name}`);
      return;
    }

    el.classList.add('active');
    currentScreen = name;

    if (name === 'levels') _buildLevelsGrid();
    if (name === 'leaderboard') TelegramAPI.loadLeaderboard();
    if (name === 'menu') {
      _setupMenuAnim();
      updateMenuPlayerMini();
    }
    if (name === 'account') ProfileUI.updateAccountScreen();
    if (name === 'char-select') ProfileUI.updateCharSelectScreen();

    // ─── Menu Audio Control ───
    _updateMenuAudio(name);
  }

  function goBack() {
    if (lastScreen === 'game') {
      showScreen('game');
      // If we are in game, re-show pause menu
      if (typeof window.togglePause === 'function') window.togglePause(true);
    } else {
      showScreen('menu');
    }
  }

  function _updateMenuAudio(screenName) {
    const audio = document.getElementById('menu-audio');
    if (!audio) return;

    const menuScreens = ['menu', 'profile', 'account', 'char-select', 'levels', 'about', 'settings'];
    if (menuScreens.includes(screenName)) {
      if (audio.paused) audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  // ─── Menu animation & Mini Player ─────────────────────────
  function _setupMenuAnim() {
    document.querySelectorAll('.menu-buttons-column .btn-banner-wrap').forEach((btn, i) => {
      btn.style.opacity = '0';
      btn.style.transform = 'translateX(20px)';
      setTimeout(() => {
        btn.style.transition = 'all 0.35s cubic-bezier(0.4,0,0.2,1)';
        btn.style.opacity = '1';
        btn.style.transform = 'translateX(0)';
      }, 80 + i * 60);
    });
  }

  function updateMenuPlayerMini() {
    try {
      const nameEl  = document.getElementById('menu-player-name');
      const levelEl = document.getElementById('menu-player-level');
      const name    = localStorage.getItem('maze3d_player_name') || 'المغامر';
      const currentLevel = (window.LevelManager && typeof LevelManager.getCurrentIndex === 'function')
        ? LevelManager.getCurrentIndex()
        : 1;

      if (nameEl) nameEl.textContent = name;
      if (levelEl) levelEl.textContent = `المرحلة: ${currentLevel}`;
    } catch (e) {}
  }

  // ─── Levels grid (5 Columns Landscape) ─────────────────────
  function _buildLevelsGrid() {
    const grid = document.getElementById('levels-grid');
    if (!grid) return;

    const registered = LevelManager.getRegisteredLevels ? LevelManager.getRegisteredLevels() : [];
    const levels = registered.length ? registered : [{ index: 1, def: { name: 'المرحلة 1' } }];

    grid.innerHTML = '';
    levels.forEach(({ index, def }) => {
      const unlocked = LevelManager.isUnlocked(index);
      const stars    = LevelManager.getStars(index);
      const label    = def?.name || `مرحلة ${index}`;

      const card = document.createElement('div');
      card.className = `level-card${unlocked ? '' : ' locked'}`;
      card.innerHTML = unlocked
        ? `<div class="level-num">${index}</div>
           <div class="level-title-mini">${label}</div>
           <div class="level-stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>`
        : `<div class="level-num" style="opacity:0.4;">🔒</div>
           <div class="level-title-mini">${label}</div>`;

      if (unlocked) {
        card.onclick = () => {
          requestFullscreenAndLandscape();
          LevelManager.load(index);
        };
      }
      grid.appendChild(card);
    });
  }

  // ─── Fullscreen & Landscape Orientation Lock ──────────────
  async function requestFullscreenAndLandscape() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {
      console.warn('[UI] Fullscreen/Landscape lock error:', e);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      requestFullscreenAndLandscape();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  // ─── Toast ────────────────────────────────────────────────
  function toast(message, type = 'info', duration = 3000) {
    console.log(`[UI] Toast Triggered: ${message} (${type})`);

    let el = document.getElementById('toast-el');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-el';
      document.body.appendChild(el);
    }

    el.className = `toast visible ${type}`;
    el.innerHTML = message;

    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove('visible');
    }, duration);
  }

  // ─── Loading progress ─────────────────────────────────────
  function setLoadingText(text) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }

  function setLoadingProgress(progress) {
    const el = document.getElementById('loading-bar');
    if (el) el.style.width = `${progress}%`;
    const pEl = document.getElementById('loading-percentage');
    if (pEl) pEl.textContent = `${Math.round(progress)}%`;
  }

  const tips = [
    "اجمع كل المفاتيح لفتح بوابة الخروج السحرية!",
    "الجري يستهلك الطاقة، تأكد من الراحة لاستعادتها.",
    "استخدم الخريطة المصغرة لتجنب الضياع في الممرات.",
    "يمكنك تغيير منظور الكاميرا من الإعدادات أو زر الكاميرا.",
    "الجدران قد تبدو متشابهة، ابحث عن العلامات المميزة.",
    "بعض الأسرار مخفية في زوايا المتاهة المظلمة."
  ];

  function updateLoadingTip() {
    const el = document.getElementById('loading-tip-text');
    if (el) {
      el.textContent = tips[Math.floor(Math.random() * tips.length)];
    }
  }

  function getCurrent() { return currentScreen; }
  function getLast()    { return lastScreen; }

  return {
    showScreen,
    goBack,
    toast,
    setLoadingText,
    setLoadingProgress,
    updateLoadingTip,
    getCurrent,
    getLast,
    requestFullscreenAndLandscape,
    toggleFullscreen,
    updateMenuPlayerMini,
  };
})();
