/**
 * InputManager.js
 * Keyboard, Mouse, Touch — unified input system (Mobile Landscape First)
 */

const InputManager = (() => {
  const keys      = {};
  const mouse     = { x: 0, y: 0, dx: 0, dy: 0, locked: false, isDown: false };
  const touchLook = { active: false, id: null, lastX: 0, lastY: 0 };
  let   listeners = [];

  let mobileSprintActive = false;
  let jumpRequested      = false;
  let interactRequested  = false;

  // ─── Init ────────────────────────────────────────────────
  function init() {
    // Keyboard
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);

    // Mouse movement
    window.addEventListener('mousemove',       onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLock);

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      // Click canvas to lock pointer on desktop
      canvas.addEventListener('click', () => {
        if (UI.getCurrent() === 'game' && !('ontouchstart' in window)) {
          requestPointerLock();
        }
      });

      // Mouse drag fallback (when not pointer-locked)
      canvas.addEventListener('mousedown', (e) => {
        mouse.isDown = true;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      });
      window.addEventListener('mouseup', () => {
        mouse.isDown = false;
      });

      // Touch drag for camera look on mobile / tablet
      window.addEventListener('touchstart', onTouchLookStart, { passive: false });
      window.addEventListener('touchmove',  onTouchLookMove,  { passive: false });
      window.addEventListener('touchend',   onTouchLookEnd,   { passive: false });
      window.addEventListener('touchcancel',onTouchLookEnd,   { passive: false });
    }

    // Bind Mobile Action Buttons
    _bindMobileButtons();

    console.log('[InputManager] Initialized with mobile landscape controls ✓');
  }

  function _bindMobileButtons() {
    // 1. Jump Button
    const btnJump = document.getElementById('btn-action-jump');
    if (btnJump) {
      const handleJumpPress = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        triggerJump();
        if (window.TelegramAPI) TelegramAPI.haptic('light');
      };
      const handleJumpRelease = (e) => {
        if (e && e.cancelable) e.preventDefault();
        keys['Space'] = false;
        emit('keyup', 'Space');
      };

      btnJump.addEventListener('pointerdown', handleJumpPress);
      btnJump.addEventListener('touchstart', handleJumpPress, { passive: false });
      btnJump.addEventListener('mousedown', handleJumpPress);

      btnJump.addEventListener('pointerup', handleJumpRelease);
      btnJump.addEventListener('touchend', handleJumpRelease, { passive: false });
      btnJump.addEventListener('mouseup', handleJumpRelease);
      btnJump.addEventListener('pointercancel', handleJumpRelease);
    }

    // 2. Sprint Button (Toggle or Hold)
    const btnSprint = document.getElementById('btn-action-sprint');
    if (btnSprint) {
      const toggleSprint = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        mobileSprintActive = !mobileSprintActive;
        btnSprint.classList.toggle('active', mobileSprintActive);
        if (window.TelegramAPI) TelegramAPI.haptic('light');
      };

      btnSprint.addEventListener('pointerdown', toggleSprint);
      btnSprint.addEventListener('touchstart', toggleSprint, { passive: false });
      btnSprint.addEventListener('mousedown', toggleSprint);
    }

    // 3. Interact Button
    const btnInteract = document.getElementById('btn-action-interact');
    if (btnInteract) {
      const handleInteract = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        triggerInteract();
        if (window.TelegramAPI) TelegramAPI.haptic('medium');
      };

      btnInteract.addEventListener('pointerdown', handleInteract);
      btnInteract.addEventListener('touchstart', handleInteract, { passive: false });
      btnInteract.addEventListener('mousedown', handleInteract);
    }
  }

  // ─── Keyboard ────────────────────────────────────────────
  function onKeyDown(e) {
    keys[e.code] = true;
    emit('keydown', e.code);
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    emit('keyup', e.code);
  }

  function isDown(code)    { return !!keys[code]; }

  // Movement helpers (WASD + Arrow)
  function moveForward()  { return isDown('KeyW') || isDown('ArrowUp'); }
  function moveBackward() { return isDown('KeyS') || isDown('ArrowDown'); }
  function moveLeft()     { return isDown('KeyA') || isDown('ArrowLeft'); }
  function moveRight()    { return isDown('KeyD') || isDown('ArrowRight'); }
  function isSprinting()  { return isDown('ShiftLeft') || isDown('ShiftRight') || joystick.sprint || mobileSprintActive; }
  function isInteracting(){ return isDown('KeyE') || interactRequested; }
  function jump()         { return isDown('Space'); }

  // ─── Mouse Look ───────────────────────────────────────────
  function onMouseMove(e) {
    if (mouse.locked) {
      mouse.dx += e.movementX || 0;
      mouse.dy += e.movementY || 0;
    } else if (mouse.isDown) {
      mouse.dx += (e.clientX - mouse.x);
      mouse.dy += (e.clientY - mouse.y);
    }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function onPointerLock() {
    mouse.locked = document.pointerLockElement !== null;
  }

  function requestPointerLock() {
    const canvas = document.getElementById('game-canvas');
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  }
  function exitPointerLock() {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  // ─── Touch Look (Mobile Landscape) ────────────────────────
  function onTouchLookStart(e) {
    if (touchLook.active) return;
    if (UI.getCurrent() !== 'game') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];

      // Check if touch target is a button or joystick
      const target = document.elementFromPoint(t.clientX, t.clientY);
      if (target && (target.closest('.joystick-zone') || target.closest('.action-buttons-cluster') || target.closest('.hud-top') || target.closest('.pickup-dialog') || target.closest('.mission-popup'))) {
        continue;
      }

      // Capture touches on right 65% of the screen or upper area
      const isTouchLookArea = t.clientX > window.innerWidth * 0.35 || t.clientY < window.innerHeight * 0.5;
      if (isTouchLookArea) {
        touchLook.active = true;
        touchLook.id     = t.identifier;
        touchLook.lastX  = t.clientX;
        touchLook.lastY  = t.clientY;
        break;
      }
    }
  }

  function onTouchLookMove(e) {
    if (!touchLook.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchLook.id) {
        if (e.cancelable) e.preventDefault();
        const deltaX = (t.clientX - touchLook.lastX);
        const deltaY = (t.clientY - touchLook.lastY);

        // Increased sensitivity for mobile touch look (from 1.6 to 2.4)
        mouse.dx += deltaX * 2.4;
        mouse.dy += deltaY * 2.4;

        touchLook.lastX = t.clientX;
        touchLook.lastY = t.clientY;
        break;
      }
    }
  }

  function onTouchLookEnd(e) {
    if (!touchLook.active) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchLook.id) {
        touchLook.active = false;
        touchLook.id     = null;
        break;
      }
    }
  }

  function consumeMouseDelta() {
    const dx = mouse.dx, dy = mouse.dy;
    mouse.dx = 0;
    mouse.dy = 0;
    return { dx, dy };
  }

  // ─── Event Bus ───────────────────────────────────────────
  function on(event, cb) {
    listeners.push({ event, cb });
    return () => off(event, cb);
  }
  function off(event, cb) {
    listeners = listeners.filter(l => !(l.event === event && l.cb === cb));
  }
  function emit(event, data) {
    listeners.filter(l => l.event === event).forEach(l => l.cb(data));
  }

  // ─── Joystick Input (set by Joystick.js) ─────────────────
  const joystick = { x: 0, y: 0, sprint: false };
  function setJoystick(x, y, sprint = false) {
    joystick.x = x;
    joystick.y = y;
    joystick.sprint = sprint;
  }
  function getJoystick() { return { ...joystick }; }

  // ─── Action Triggers ──────────────────────────────────────
  function triggerJump() {
    jumpRequested = true;
    keys['Space'] = true;
    emit('keydown', 'Space');
  }

  function consumeJump() {
    const val = jumpRequested || !!keys['Space'];
    jumpRequested = false;
    return val;
  }

  function triggerInteract() {
    interactRequested = true;
    keys['KeyE'] = true;
    emit('keydown', 'KeyE');

    // Auto release after tick
    setTimeout(() => {
      interactRequested = false;
      keys['KeyE'] = false;
      emit('keyup', 'KeyE');
    }, 150);

    // If confirmation pickup dialog is visible, trigger Yes
    const pickupDialog = document.getElementById('pickup-dialog');
    if (pickupDialog && !pickupDialog.classList.contains('hidden')) {
      const btnYes = document.getElementById('btn-pickup-yes');
      btnYes?.click();
    }
  }

  // ─── Destroy ─────────────────────────────────────────────
  function destroy() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup',   onKeyUp);
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLock);
    listeners = [];
  }

  return {
    init, isDown,
    moveForward, moveBackward, moveLeft, moveRight, isSprinting, isInteracting, consumeJump, triggerJump, triggerInteract,
    requestPointerLock, exitPointerLock, consumeMouseDelta,
    setJoystick, getJoystick,
    on, off, emit,
    mouse, keys,
    destroy,
  };
})();
