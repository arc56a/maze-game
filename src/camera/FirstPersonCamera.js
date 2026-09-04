/**
 * FirstPersonCamera.js
 * Advanced AAA First-Person Camera System:
 * - Biomechanical harmonic figure-8 head bobbing (smooth lemniscate motion, no sharp bouncing)
 * - True camera-relative lateral sway (anatomically aligned with viewing orientation)
 * - Dynamic parabolic jump arc with liftoff anticipation and aerial floating
 * - Critically damped spring-damper musculoskeletal cushion on landings
 * - Living character organic idle breathing cycle
 * - Smooth banking/roll lean during turns and strafes
 * - Exponential decay state transitions ensuring zero jitter or abrupt pops
 */

const FirstPersonCamera = (() => {
  let camera;
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const EYE_HEIGHT = 1.62; // Realistic human eye level

  // Motion accumulators
  let stepTimer   = 0;
  let breathTimer = 0;

  // Smoothed motion intensities
  let currentWeight = 0;
  let currentFreq   = 8.0;
  let currentAmpY   = 0.028;
  let currentAmpX   = 0.014;
  let currentRoll   = 0.007;

  // Turn banking / inertia
  let lastYaw        = 0;
  let currentBankRoll = 0;
  let initializedYaw = false;

  // Jump & Landing Spring-Damper simulation
  let wasJumping      = false;
  let landingOffset   = 0;
  let landingVelocity = 0;
  let jumpY           = 0;
  let jumpPitch       = 0;

  function init() {
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.08, // Close near plane to prevent seeing through mesh or clipping
      1000
    );
    camera.position.y = EYE_HEIGHT;
    camera.layers.set(0); // Strictly channel 0 (never renders Layer 1 player mesh)

    reset();
    console.log('[FirstPersonCamera] Advanced AAA FPS Camera Initialized ✓');
  }

  function reset() {
    stepTimer       = 0;
    breathTimer     = 0;
    currentWeight   = 0;
    currentBankRoll = 0;
    initializedYaw  = false;
    wasJumping      = false;
    landingOffset   = 0;
    landingVelocity = 0;
    jumpY           = 0;
    jumpPitch       = 0;
  }

  function update(delta, playerPosition, playerYaw, playerPitch) {
    if (!camera) return;

    // Clamp delta to avoid physics instability on tab switch or lag spikes
    const dt = Math.min(0.05, Math.max(0.001, delta));

    // ─── 1. Determine Motion Targets ───
    const pc = (typeof PlayerController !== 'undefined') ? PlayerController : null;
    const playerState = pc ? pc.getState() : 'idle';
    const isJumping = (pc && typeof pc.isJumping === 'function') ? pc.isJumping() : (playerState === 'jump');
    const jumpProgress = (pc && typeof pc.getJumpProgress === 'function') ? pc.getJumpProgress() : 0;

    let targetWeight = 0;
    let targetFreq   = 7.0;
    let targetAmpY   = 0.012;
    let targetAmpX   = 0.006;
    let targetRoll   = 0.0025;

    if (isJumping) {
      // While in the air, stride bobbing is suppressed
      targetWeight = 0;
    } else if (playerState === 'run') {
      targetWeight = 1.0;
      targetFreq   = 9.8;   // Smooth athletic cadence
      targetAmpY   = 0.024; // 2.4 cm vertical stride displacement (subtle & stable)
      targetAmpX   = 0.012; // 1.2 cm lateral sway
      targetRoll   = 0.0055;
    } else if (playerState === 'walk') {
      targetWeight = 1.0;
      targetFreq   = 7.0;   // Relaxed walking cadence
      targetAmpY   = 0.012; // 1.2 cm gentle vertical displacement (very subtle & comfortable)
      targetAmpX   = 0.006; // 0.6 cm subtle lateral sway
      targetRoll   = 0.0025;
    } else {
      targetWeight = 0;
    }

    // Smooth exponential blending between movement states (eliminates abrupt cuts/pops)
    const blendRate = targetWeight > currentWeight ? 8.0 : 6.0;
    currentWeight += (targetWeight - currentWeight) * (1 - Math.exp(-blendRate * dt));
    currentFreq   += (targetFreq   - currentFreq)   * (1 - Math.exp(-8.0 * dt));
    currentAmpY   += (targetAmpY   - currentAmpY)   * (1 - Math.exp(-8.0 * dt));
    currentAmpX   += (targetAmpX   - currentAmpX)   * (1 - Math.exp(-8.0 * dt));
    currentRoll   += (targetRoll   - currentRoll)   * (1 - Math.exp(-8.0 * dt));

    // ─── 2. Continuous Biomechanical Footstep Cycle ───
    if (currentWeight > 0.002) {
      // Step timer advances continuously with foot cadence
      stepTimer += dt * currentFreq;
    }

    // Harmonic lemniscate (figure-8) curves:
    // Vertical bobbing: -cos(2 * t) dips at foot plant and rises smoothly between steps
    // Adding 0.10 * cos(4 * t) provides a natural subtle shock absorption contour
    const strideY = (-Math.cos(2 * stepTimer) + 0.10 * Math.cos(4 * stepTimer)) * currentAmpY * currentWeight;

    // Lateral sway: sin(t) sways smoothly left-to-right in tandem with footfalls
    const strideX = Math.sin(stepTimer) * currentAmpX * currentWeight;

    // Roll: head tilts slightly towards the planted foot
    const strideRoll = -Math.sin(stepTimer) * currentRoll * currentWeight;

    // Pitch: gentle micro-nodding rhythm matching forward step momentum
    const stridePitch = Math.cos(2 * stepTimer) * (currentAmpY * 0.08) * currentWeight;

    // ─── 3. Organic Idle Breathing Cycle ───
    breathTimer += dt * 1.5; // ~15 breaths per minute
    const breathFactor = Math.max(0, 1.0 - currentWeight * 0.9);
    const breathY     = Math.sin(breathTimer) * 0.0045 * breathFactor;
    const breathRoll  = Math.cos(breathTimer * 0.5) * 0.0015 * breathFactor;
    const breathPitch = Math.sin(breathTimer) * 0.0022 * breathFactor;

    // ─── 4. Jump Trajectory & Physics ───
    if (isJumping) {
      const JUMP_HEIGHT = 0.62; // Peak apex height in meters
      // Anticipation push during initial 8% of jump
      if (jumpProgress < 0.08) {
        const t = jumpProgress / 0.08;
        jumpY     = -0.04 * Math.sin(t * Math.PI);
        jumpPitch = -0.015 * Math.sin(t * Math.PI);
      } else {
        // Parabolic trajectory h(p) = 4 * p * (1 - p)
        const p = (jumpProgress - 0.08) / 0.92;
        jumpY = 4 * p * (1 - p) * JUMP_HEIGHT;
        // Head tilts up during ascent (+), levels off at peak, tilts down on descent (-)
        jumpPitch = (1 - 2 * p) * 0.038;
      }
      wasJumping = true;
    } else {
      jumpY     = 0;
      jumpPitch = 0;

      // Detect Touchdown / Landing Impact
      if (wasJumping) {
        wasJumping = false;
        // Initialize soft downward compression velocity
        landingVelocity = -0.26;
        landingOffset   = -0.04;
      }
    }

    // ─── 5. Musculoskeletal Spring-Damper Landing Cushion ───
    if (Math.abs(landingOffset) > 0.0002 || Math.abs(landingVelocity) > 0.001) {
      // Spring stiffness k and critical damping c (zeta ~ 0.88)
      const springK = 135.0;
      const springDamping = 18.0;

      const springAcc = -springK * landingOffset - springDamping * landingVelocity;
      landingVelocity += springAcc * dt;
      landingOffset   += landingVelocity * dt;

      // Soft clamp
      landingOffset = Math.max(-0.14, Math.min(0.04, landingOffset));
    } else {
      landingOffset   = 0;
      landingVelocity = 0;
    }
    // Landing impact tilts head forward slightly then cushions up
    const landingPitch = landingOffset * 0.32;

    // ─── 6. Turn Inertia (Banking & Leaning into Turns) ───
    if (!initializedYaw) {
      lastYaw = playerYaw;
      initializedYaw = true;
    }
    let yawDelta = playerYaw - lastYaw;
    while (yawDelta >  Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    lastYaw = playerYaw;

    const yawRate = dt > 0.0001 ? yawDelta / dt : 0;
    // Gentle bank roll proportional to turning speed (capped at ~1.3 degrees)
    const targetBankRoll = Math.max(-0.022, Math.min(0.022, -yawRate * 0.006));
    currentBankRoll += (targetBankRoll - currentBankRoll) * (1 - Math.exp(-12.0 * dt));

    // ─── 7. Local Camera Space to World Space Transformation ───
    // Rotate lateral sway (strideX) into character viewing orientation
    const cosY = Math.cos(playerYaw);
    const sinY = Math.sin(playerYaw);

    // Forward eye offset from character center (places eyes naturally forward)
    const eyeForward = 0.18;
    const worldOffX = strideX * cosY - eyeForward * sinY;
    const worldOffZ = strideX * (-sinY) - eyeForward * cosY;

    // Total vertical offset
    const totalY = EYE_HEIGHT + strideY + breathY + jumpY + landingOffset;

    camera.position.set(
      playerPosition.x + worldOffX,
      playerPosition.y + totalY,
      playerPosition.z + worldOffZ
    );

    // ─── 8. Final Orientation with Procedural Head Tilts ───
    const finalPitch = -playerPitch + stridePitch + breathPitch + jumpPitch + landingPitch;
    const finalRoll  = strideRoll + breathRoll + currentBankRoll;

    euler.set(finalPitch, playerYaw, finalRoll, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }

  function getCamera() { return camera; }

  return { init, reset, update, getCamera };
})();
