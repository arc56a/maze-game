/**
 * CameraController.js
 * Manages switching between First-Person and Third-Person cameras
 */

const CameraController = (() => {
  let activeCamera = null;
  let mode         = 'third'; // 'first' | 'third'

  // ─── Init ────────────────────────────────────────────────
  function init(startMode = 'third') {
    mode = startMode;
    FirstPersonCamera.init();
    ThirdPersonCamera.init();
    DevCamera.init();
    setMode(mode);
    console.log('[CameraController] Init ✓ mode:', mode);
  }

  // ─── Switch mode ──────────────────────────────────────────
  function setMode(newMode) {
    mode = newMode;

    const btn = document.getElementById('btn-cam-toggle');
    const imgFirst = `<img src="assets/ui/icons/cam_first.png" alt="منظور شخص أول" class="hud-btn-img" />`;
    const imgThird = `<img src="assets/ui/icons/cam_third.png" alt="منظور شخص ثالث" class="hud-btn-img" />`;
    const svgDev = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;

    if (mode === 'dev') {
      activeCamera = DevCamera.getCamera();
      document.getElementById('crosshair')?.classList.add('hidden');
      if (btn) btn.innerHTML = svgDev;
      InputManager.exitPointerLock(); // Free the mouse cursor for dev mode
    } else if (mode === 'first') {
      activeCamera = FirstPersonCamera.getCamera();
      document.getElementById('crosshair')?.classList.remove('hidden');
      if (btn) btn.innerHTML = imgThird; // Clicking will switch to third
    } else {
      activeCamera = ThirdPersonCamera.getCamera();
      document.getElementById('crosshair')?.classList.add('hidden');
      if (btn) btn.innerHTML = imgFirst; // Clicking will switch to first
    }

    // Update UI toggle buttons
    document.getElementById('cam-first')?.classList.toggle('active', mode === 'first');
    document.getElementById('cam-third')?.classList.toggle('active', mode === 'third');
  }

  function toggle() {
    setMode(mode === 'first' ? 'third' : 'first');
  }

  let pDown = false;
  let oldMode = 'third';

  // ─── Update ───────────────────────────────────────────────
  function update(delta, playerPosition, playerYaw, playerPitch) {
    // DEV MODE TOGGLE (Shortcut: P)
    if (InputManager.keys['KeyP']) {
      if (!pDown) {
        pDown = true;
        if (mode !== 'dev') {
          oldMode = mode;
          DevCamera.sync(playerPosition);
          setMode('dev');
        } else {
          setMode(oldMode || 'third');
        }
      }
    } else {
      pDown = false;
    }

    if (mode === 'dev') {
      DevCamera.update(delta);
    } else if (mode === 'first') {
      FirstPersonCamera.update(delta, playerPosition, playerYaw, playerPitch);
    } else {
      ThirdPersonCamera.update(delta, playerPosition, playerYaw, playerPitch);
    }
  }

  // ─── Resize ───────────────────────────────────────────────
  function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    FirstPersonCamera.getCamera().aspect = aspect;
    FirstPersonCamera.getCamera().updateProjectionMatrix();
    ThirdPersonCamera.getCamera().aspect = aspect;
    ThirdPersonCamera.getCamera().updateProjectionMatrix();
    if (DevCamera.getCamera()) {
      DevCamera.getCamera().aspect = aspect;
      DevCamera.getCamera().updateProjectionMatrix();
    }
  }

  function getActive() { return activeCamera; }
  function getCamera() { return activeCamera; }
  function getMode()   { return mode; }

  return { init, setMode, toggle, update, onResize, getActive, getCamera, getMode };
})();
