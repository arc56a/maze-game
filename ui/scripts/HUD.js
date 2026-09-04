/**
 * HUD.js — Heads-Up Display updates
 */

const HUD = (() => {
  let _timerInterval = null;
  let _startTime     = 0;

  // ─── Level ────────────────────────────────────────────────
  function setLevel(n) {
    document.getElementById('hud-level-num').textContent = n;
  }

  // ─── Timer ────────────────────────────────────────────────
  function setTimer(seconds) {
    document.getElementById('hud-time').textContent = formatTime(seconds);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // ─── Keys / Target ───────────────────────────────────────
  function setKeys(collected, total) {
    const el = document.getElementById('hud-coins');
    if (!el) return;
    if (total === 0) {
      el.style.display = 'none';
    } else {
      el.style.display = 'flex';
      el.innerHTML = `<img src="assets/ui/icons/hud_key.png" alt="مفتاح" class="hud-key-icon-top" /><span id="hud-keys">${collected}/${total}</span>`;
    }
  }

  // ─── Health & Stamina ─────────────────────────────────────
  function setHealth(value) {
    const el = document.getElementById('health-bar-fill');
    if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }

  function setStamina(value) {
    const el = document.getElementById('stamina-bar-fill');
    if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
  }


  // ─── Win flash ────────────────────────────────────────────
  function showWin() {
    const hud = document.getElementById('hud');
    const flash = document.createElement('div');
    flash.className = 'level-clear-overlay';
    flash.innerHTML = '<div class="level-clear-text">🎉</div>';
    hud.appendChild(flash);
    setTimeout(() => flash.remove(), 2000);
  }

  // ─── Damage flash ────────────────────────────────────────
  function showDamage() {
    const hud = document.getElementById('hud');
    const flash = document.createElement('div');
    flash.className = 'damage-flash';
    hud.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
  }

  // ─── Interaction prompt ───────────────────────────────────
  function showPrompt(text) {
    let el = document.getElementById('interact-prompt');
    if (!el) {
      el = document.createElement('div');
      el.id = 'interact-prompt';
      document.getElementById('hud').appendChild(el);
    }
    el.textContent = text;
    el.classList.add('visible');
  }
  function hidePrompt() {
    document.getElementById('interact-prompt')?.classList.remove('visible');
  }

  // ─── Mission Popup ────────────────────────────────────────
  let _toastTimer = null;
  let _toastHideTimer = null;

  function toggleMission(force) {
    const el = document.getElementById('mission-popup');
    if (!el) return;
    const show = (force !== undefined) ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);

    // Hide alert when user opens the mission panel
    if (show) {
      setMissionAlert(false);
      TelegramAPI.haptic('light');

      // Also hide toast if it's visible
      const toast = document.getElementById('mission-toast');
      if (toast) {
        toast.classList.remove('visible');
        setTimeout(() => toast.classList.add('hidden'), 500);
      }
    }
  }

  function setMissionAlert(show) {
    const alert = document.getElementById('mission-alert');
    if (alert) alert.classList.toggle('hidden', !show);
  }

  function updateMissionTask(id, isDone) {
    const el = document.getElementById(id);
    if (!el) return;
    // Use actual image assets instead of emoji
    el.innerHTML = isDone
      ? '<img src="assets/ui/icons/hud_key.png" alt="مكتمل" class="task-status-icon task-status-done" />'
      : '<img src="assets/ui/icons/hud_timer.png" alt="معلق" class="task-status-icon task-status-pending" />';
    el.classList.toggle('done', isDone);

    // If a task is completed, show the notification dot AND text toast
    if (isDone) {
      setMissionAlert(true);

      const taskText = el.previousElementSibling?.textContent || "مهمة مكتملة!";
      showMissionToast(`اكتملت: ${taskText}`);
    }
  }

  function showMissionToast(message) {
    const toast = document.getElementById('mission-toast');
    if (!toast) return;

    // Clear existing timers
    if (_toastTimer) clearTimeout(_toastTimer);
    if (_toastHideTimer) clearTimeout(_toastHideTimer);

    toast.textContent = message;
    toast.classList.remove('hidden');
    // Force reflow
    toast.offsetHeight;
    toast.classList.add('visible');

    // Auto hide and hide the alert dot
    _toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
      _toastHideTimer = setTimeout(() => {
        toast.classList.add('hidden');
        setMissionAlert(false);
        _toastTimer = null;
        _toastHideTimer = null;
      }, 500);
    }, 4000);
  }

  // ─── Pickup / Interaction Confirmation ──────────────────
  function showPickupPrompt(show, onConfirm = null, options = {}) {
    const el = document.getElementById('pickup-dialog');
    if (!el) return;

    if (show) {
      const title = document.getElementById('pickup-title');
      const sub   = document.getElementById('pickup-sub');
      const icon  = document.getElementById('pickup-icon');

      if (title) title.textContent = options.title || "لقد وجدت شيئاً!";
      if (sub)   sub.textContent   = options.sub   || "هل تريد التقاطه؟";
      if (icon)  icon.textContent  = options.icon  || "🗝️";
    }

    el.classList.toggle('hidden', !show);

    if (show && onConfirm) {
      const btnYes = document.getElementById('btn-pickup-yes');
      const btnNo  = document.getElementById('btn-pickup-no');

      const newBtnYes = btnYes.cloneNode(true);
      const newBtnNo  = btnNo.cloneNode(true);
      btnYes.parentNode.replaceChild(newBtnYes, btnYes);
      btnNo.parentNode.replaceChild(newBtnNo, btnNo);

      newBtnYes.onclick = () => {
        showPickupPrompt(false);
        onConfirm();
      };
      newBtnNo.onclick = () => showPickupPrompt(false);
    }
  }

  // ─── Celestial & Weather HUD ──────────────────────────────
  function updateCelestial(data) {
    if (!data) return;
    const { timeStr, isNight, orbitAngle, weatherIcon, weatherLabel } = data;

    const timeEl = document.getElementById('celestial-time-text');
    if (timeEl && timeStr && timeEl.textContent !== timeStr) {
      timeEl.textContent = timeStr;
    }

    const iconEl = document.getElementById('celestial-body-icon');
    if (iconEl) {
      const targetBody = isNight ? '🌙' : '☀️';
      if (iconEl.textContent !== targetBody) iconEl.textContent = targetBody;
    }

    const ringEl = document.getElementById('celestial-orbit-ring');
    if (ringEl && typeof orbitAngle === 'number') {
      ringEl.style.transform = `rotate(${orbitAngle}deg)`;
    }

    const wIconEl = document.getElementById('celestial-weather-icon');
    if (wIconEl && weatherIcon && wIconEl.textContent !== weatherIcon) {
      wIconEl.textContent = weatherIcon;
    }

    const wNameEl = document.getElementById('celestial-weather-name');
    if (wNameEl && weatherLabel && wNameEl.textContent !== weatherLabel) {
      wNameEl.textContent = weatherLabel;
    }
  }

  return {
    setLevel, setTimer, formatTime, setKeys,
    setHealth, setStamina,
    showWin, showDamage, showPrompt, hidePrompt,
    toggleMission, updateMissionTask, showPickupPrompt, showMissionToast, setMissionAlert,
    updateCelestial
  };
})();
