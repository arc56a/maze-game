/**
 * Joystick.js — Virtual joystick for mobile / touch
 * Modern dynamic joystick with Sprint support
 */

const Joystick = (() => {
  let zone, base, thumb, sprintIcon;
  let active      = false;
  let touchId     = null;
  let startX      = 0, startY = 0;
  let currentX    = 0, currentY = 0;

  const MAX_DIST    = 45;   // px radius for movement
  const SPRINT_DIST  = 75;   // px radius for sprint lock
  const DEAD_ZONE   = 5;

  // ─── Init ────────────────────────────────────────────────
  function init() {
    zone        = document.getElementById('joystick-zone');
    base        = zone?.querySelector('.joystick-base');
    thumb       = document.getElementById('joystick-thumb');
    sprintIcon  = zone?.querySelector('.sprint-icon');

    if (!zone || !thumb) return;

    zone.addEventListener('touchstart',  onStart, { passive: false });
    zone.addEventListener('touchmove',   onMove,  { passive: false });
    zone.addEventListener('touchend',    onEnd,   { passive: false });
    zone.addEventListener('touchcancel', onEnd,   { passive: false });

    // Mouse fallback for testing
    zone.addEventListener('mousedown', e => {
      active = true;
      _setBasePosition(e.clientX, e.clientY);
      startX = e.clientX;
      startY = e.clientY;
    });
    document.addEventListener('mousemove', e => {
      if (!active) return;
      _handleInput(e.clientX, e.clientY);
    });
    document.addEventListener('mouseup', onEnd);

    console.log('[Joystick] Modern Init ✓');
  }

  // ─── Touch handlers ───────────────────────────────────────
  function onStart(e) {
    if (active) return;

    // Professional Multi-touch handling:
    // Only capture the touch that actually started inside the zone
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);

      if (target && (target === zone || zone.contains(target))) {
        e.preventDefault();
        touchId = touch.identifier;
        active = true;

        _setBasePosition(touch.clientX, touch.clientY);
        startX = touch.clientX;
        startY = touch.clientY;

        TelegramAPI.haptic('light');
        break;
      }
    }
  }

  function onMove(e) {
    if (!active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchId) {
        e.preventDefault();
        _handleInput(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  function onEnd(e) {
    if (!active) return;
    if (e && e.changedTouches) {
      let found = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId) found = true;
      }
      if (!found) return;
    }

    active   = false;
    touchId  = null;
    currentX = 0;
    currentY = 0;

    _resetBase();
    _moveThumb(0, 0);
    _updateSprintIcon(false);
    InputManager.setJoystick(0, 0, false);
  }

  // ─── Logic ───────────────────────────────────────────────
  function _handleInput(clientX, clientY) {
    let dx = clientX - startX;
    let dy = clientY - startY;

    const dist = Math.sqrt(dx * dx + dy * dy);

    // Sprint logic (Pull up significantly)
    // dy is negative when pulling UP
    const isSprintArea = (dy < -SPRINT_DIST * 0.7);
    const isSprintLocked = dist > SPRINT_DIST && dy < 0;

    const max = isSprintLocked ? SPRINT_DIST : MAX_DIST;
    const scale = dist > max ? max / dist : 1;

    currentX = dx * scale;
    currentY = dy * scale;

    _moveThumb(currentX, currentY);
    _updateSprintIcon(isSprintArea);

    // Normalize for InputManager
    // Speed is full at MAX_DIST, Sprint kicks in if we go beyond
    const normX = currentX / MAX_DIST;
    const normY = currentY / MAX_DIST;

    InputManager.setJoystick(normX, normY, isSprintArea);
  }

  function _setBasePosition(x, y) {
    if (!base) return;
    const rect = zone.getBoundingClientRect();
    // Keep base within zone bounds
    const localX = x - rect.left;
    const localY = y - rect.top;

    base.style.position = 'absolute';
    base.style.left = `${localX}px`;
    base.style.top  = `${localY}px`;
    base.style.transform = 'translate(-50%, -50%)';
    base.style.opacity = '0.8'; // زيادة الوضوح عند اللمس
  }

  function _resetBase() {
    if (!base) return;
    base.style.position = '';
    base.style.left = '';
    base.style.top  = '';
    base.style.transform = '';
    base.style.opacity = ''; // يعود للشفافية العالية في CSS
  }

  function _moveThumb(x, y) {
    if (!thumb) return;
    thumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  function _updateSprintIcon(active) {
    if (sprintIcon) {
      sprintIcon.classList.toggle('active', active);
    }
  }

  return { init };
})();
