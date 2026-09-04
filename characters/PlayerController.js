/**
 * PlayerController.js
 * Moves player through the maze, handles animations & states
 */

const PlayerController = (() => {
  // ── Config ────────────────────────────────────────────────
  let WALK_SPEED   = 2.4;
  let RUN_SPEED    = 4.8;
  const TURN_SPEED   = 16.0;
  const SENSITIVITY  = 0.0028;
  let JUMP_FORCE   = 8.5;

  // ── Runtime ───────────────────────────────────────────────
  let model       = null;
  const position  = new THREE.Vector3();
  let isJumping   = false;
  let jumpTimer   = 0;
  let jumpDuration = 0;
  let yaw         = 0;
  let pitch       = 0.25;
  let modelYaw    = Math.PI;
  let state       = 'idle';
  let _lastState  = '';
  let initialized = false;

  let _stepTimer = 0;
  const STEP_INTERVAL_WALK = 0.58;
  const STEP_INTERVAL_RUN  = 0.38;

  const _dir = new THREE.Vector3();

  // ─── Init ─────────────────────────────────────────────────
  async function init(startCol, startRow, worldSpawn = null) {
    const modelPath = 'characters/models/female/female_1.glb';
    const charKey   = 'hero';

    const entry = await CharacterManager.load(charKey, modelPath);
    model = entry.model;
    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.layers.enable(0);
        child.layers.enable(1);
      }
    });
    SceneManager.add(model);

    if (worldSpawn) {
      position.set(worldSpawn.x, 0, worldSpawn.z);
      yaw = worldSpawn.rot || 0;
    } else {
      const wx = MazeRenderer.cellToWorld(startCol, startRow);
      position.copy(wx);
      position.y = 0;
      yaw = 0;
    }

    model.position.copy(position);
    pitch = 0.25;
    modelYaw = Math.PI + yaw;
    model.rotation.y = modelYaw;

    state = 'idle';
    _lastState = 'idle';
    isJumping = false;
    jumpTimer = 0;
    CharacterManager.playAnim(charKey, 'idle');
    if (typeof VitalSystem !== 'undefined') {
      VitalSystem.init();
    }
    initialized = true;
    console.log(`[PlayerController] Hero initialized at`, position);
  }

  function update(delta) {
    if (!initialized) return;

    // DEV MODE LOCK: If dev camera is active, player remains frozen
    const isDevMode = CameraController.getMode() === 'dev';

    if (!isDevMode) {
      const mouse = InputManager.consumeMouseDelta();
      const userSens = (window.Settings && typeof Settings.get === 'function') ? (Settings.get('sensitivity') || 1.0) : 1.0;
      const currentSens = SENSITIVITY * userSens;

      yaw -= mouse.dx * currentSens;

      const pitchMin = -1.0;
      const pitchMax = 1.2;
      pitch = Math.max(pitchMin, Math.min(pitchMax, pitch + mouse.dy * currentSens));

      _handleMovement(delta);
    } else {
      // Force idle state in dev mode
      state = 'idle';
    }

    _handleAnimation();

    if (model) {
      model.position.copy(position);
      model.rotation.y = modelYaw;

      // --- ROBUST FP/TP LAYER LOGIC ---
      // In First Person: Completely hide player mesh from FirstPersonCamera (disable layer 0),
      // but keep it on Layer 1 so directional lights still cast realistic player shadows!
      // In Third Person: Enable Layer 0 and Layer 1 for full visual rendering.
      model.visible = true;
      const isFirstPerson = CameraController.getMode() === 'first';
      const isTooClose = !isFirstPerson && typeof ThirdPersonCamera !== 'undefined' && ThirdPersonCamera.getDistance() < 0.75;
      const hideFromCamera = isFirstPerson || isTooClose;

      model.traverse(child => {
        if (child.isMesh) {
          if (hideFromCamera) {
            child.layers.disable(0); // Invisible to FP Camera
            child.layers.enable(1);  // Visible to shadow cameras
          } else {
            child.layers.enable(0);  // Visible to TP Camera
            child.layers.enable(1);
          }
        }
      });
    }

    CameraController.update(delta, position, yaw, pitch);
    CharacterManager.update(delta);
  }

  function _handleMovement(delta) {
    const joy    = InputManager.getJoystick();
    const kbFwd  = InputManager.moveForward()  ? 1 : 0;
    const kbBack = InputManager.moveBackward() ? 1 : 0;
    const kbL    = InputManager.moveLeft()     ? 1 : 0;
    const kbR    = InputManager.moveRight()    ? 1 : 0;

    let fwd    = kbFwd  - kbBack - joy.y;
    let strafe = kbR    - kbL    + joy.x;

    fwd    = Math.max(-1, Math.min(1, fwd));
    strafe = Math.max(-1, Math.min(1, strafe));

    const moving = Math.abs(fwd) > 0.05 || Math.abs(strafe) > 0.05;
    
    // Check if sprinting and vital system allows it (not exhausted)
    const canSprint = typeof VitalSystem !== 'undefined' ? !VitalSystem.getIsExhausted() : true;
    const isSprinting = InputManager.isSprinting() && canSprint;
    const speed  = isSprinting ? RUN_SPEED : WALK_SPEED;

    if (moving) {
      const len = Math.hypot(fwd, strafe);
      const nfwd = len > 1 ? fwd / len : fwd;
      const nstrafe = len > 1 ? strafe / len : strafe;

      const mx = nfwd * (-Math.sin(yaw)) + nstrafe * Math.cos(yaw);
      const mz = nfwd * (-Math.cos(yaw)) + nstrafe * (-Math.sin(yaw));

      _dir.set(mx, 0, mz).normalize();

      const newX = position.x + _dir.x * speed * delta;
      const newZ = position.z + _dir.z * speed * delta;

      position.copy(MazeCollision.resolve(new THREE.Vector3(newX, position.y, newZ)));

      const targetFacing = Math.atan2(_dir.x, _dir.z);
      modelYaw = _smoothAngle(modelYaw, targetFacing, TURN_SPEED * delta);

      // Trigger shadow map update on movement
      if (typeof Engine !== 'undefined') Engine.shadowMapNeedsUpdate = true;
    }

    // ── Handle Jumping ──
    const canJump = typeof VitalSystem !== 'undefined' ? !VitalSystem.getIsExhausted() : true;
    if (!isJumping && InputManager.consumeJump() && canJump) {
      isJumping = true;
      if (typeof VitalSystem !== 'undefined') {
        VitalSystem.consumeJumpStamina();
      }

      // Apply custom jump force if vital system doesn't manage physics directly
      // In this engine, jump physics is currently animated or simplified
      // For standard physics, we would add upward velocity here.

      // Choose running jump if moving, standard jump if standing
      const jumpAnim = moving ? 'jump_run' : 'jump';
      state = 'jump';
      _lastState = 'jump';

      const clipDur = CharacterManager.getClipDuration('hero', jumpAnim);
      const totalDur = (clipDur && clipDur > 0.25) ? clipDur : (moving ? 0.85 : 1.1);
      // Start cross-fading into landing/movement 0.15s before clip end to eliminate any T-pose glitch
      jumpDuration = Math.max(0.2, totalDur - 0.15);
      jumpTimer = 0;

      CharacterManager.playAnim('hero', jumpAnim, {
        duration: 0.1,
        loop: THREE.LoopOnce,
        clamp: true,
        force: true
      });
    }

    // ── Update Jump & State ──
    if (isJumping) {
      jumpTimer += delta;
      if (jumpTimer >= jumpDuration) {
        isJumping = false;
      }
      state = 'jump';
      if (_stepTimer > 0) AudioManager.stopWalk();
      _stepTimer = 0;
    } else if (moving) {
      state = isSprinting ? 'run' : 'walk';
      const interval = (state === 'run') ? STEP_INTERVAL_RUN : STEP_INTERVAL_WALK;
      if (_stepTimer === 0) _stepTimer = 0.05;
      _stepTimer += delta;
      if (_stepTimer >= interval) {
        AudioManager.playProceduralWalk(state === 'run' ? 0.08 : 0.05);
        _stepTimer -= interval;
      }
    } else {
      state = 'idle';
      if (_stepTimer > 0) AudioManager.stopWalk();
      _stepTimer = 0;
    }

    // Update VitalSystem at the end of the frame
    if (typeof VitalSystem !== 'undefined') {
      VitalSystem.update(delta, state);
    }
  }

  function _handleAnimation() {
    if (isJumping) return;
    if (state === _lastState) return;
    _lastState = state;
    const fadeDuration = (state === 'idle') ? 0.2 : 0.15;
    CharacterManager.playAnim('hero', state, { duration: fadeDuration, loop: THREE.LoopRepeat });
  }

  function _smoothAngle(from, to, maxStep) {
    let diff = to - from;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < maxStep) return to;
    return from + Math.sign(diff) * maxStep;
  }

  function getPosition()   { return position.clone(); }
  function getModel()      { return model; }
  function getYaw()        { return yaw; }
  function getPitch()      { return pitch; }
  function getState()      { return state; }
  function setState(s)     { state = s; }
  function teleport(x, z)  { position.set(x, 0, z); }
  function isJumpingState() { return isJumping; }
  function getJumpProgress() { return isJumping ? Math.min(1, jumpTimer / Math.max(0.1, jumpDuration)) : 0; }

  function setMovementParams(speed, jump) {
    WALK_SPEED = Number(speed) || 2.4;
    RUN_SPEED = WALK_SPEED * 2.0; // Maintain consistent sprint ratio
    JUMP_FORCE = Number(jump) || 8.5;
    console.log(`[PlayerController] Movement params updated: Speed=${WALK_SPEED}, Jump=${JUMP_FORCE}`);
  }

  function dispose() {
    if (model) { SceneManager.remove(model); model = null; }
    initialized = false;
  }

  return {
    init,
    update,
    getPosition,
    getModel,
    getYaw,
    getPitch,
    getState,
    setState,
    teleport,
    isJumping: isJumpingState,
    getJumpProgress,
    dispose
  };
})();
