/**
 * ThirdPersonCamera.js
 * Third-person orbit camera — follows player from behind (Landscape Mobile First)
 */

const ThirdPersonCamera = (() => {
  let camera;
  const target   = new THREE.Vector3();
  const current  = new THREE.Vector3();
  const lerpSpeed = 14;

  const DISTANCE_PC = 3.5;     // Closer for more "volumetric" feel
  const DISTANCE_MOBILE = 2.5; // Very close for mobile immersion
  const TARGET_HEIGHT = 1.35;  // Slightly adjusted height
  const FOV = 60;              // Reduced FOV (from 70) to eliminate fisheye distortion

  let currentDist = DISTANCE_PC;
  let initialized = false;

  function _getDesiredDist() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmall = window.innerWidth < 1024;
    return (isTouch || isSmall) ? DISTANCE_MOBILE : DISTANCE_PC;
  }

  function init() {
    camera = new THREE.PerspectiveCamera(
      FOV,
      window.innerWidth / window.innerHeight,
      0.05, // Small near plane for professional close-ups
      1000
    );
    camera.layers.enable(1); // Enable layer 1 to see the player mesh
    initialized = false;
    console.log('[ThirdPersonCamera] Init ✓ (FOV:', FOV, 'Dist:', _getDesiredDist(), ')');
  }

  function update(delta, playerPosition, playerYaw, playerPitch) {
    if (!camera) return;

    // ─── Camera Boom Position (Behind the player) ───────────
    const azimuth = playerYaw;

    // Clamp pitch for smooth touch look
    const polar = Math.max(-0.65, Math.min(1.05, playerPitch));

    const cosP = Math.cos(polar);
    const sinP = Math.sin(polar);

    const dist = _getDesiredDist();

    // Boom offset behind player
    const desiredX = playerPosition.x + dist * Math.sin(azimuth) * cosP;
    const rawY     = playerPosition.y + TARGET_HEIGHT + dist * sinP;
    const desiredY = Math.max(0.7, Math.min(MazeRenderer.WALL_H + 1.2, rawY));
    const desiredZ = playerPosition.z + dist * Math.cos(azimuth) * cosP;

    const desired = new THREE.Vector3(desiredX, desiredY, desiredZ);

    // ─── Camera Wall Collision ──────────────────────────────
    if (!initialized) {
      current.copy(desired);
      initialized = true;
    } else {
      const lf = 1 - Math.exp(-lerpSpeed * delta);
      current.lerp(desired, lf);
    }

    const finalPos = _checkCameraCollision(playerPosition, current);
    camera.position.copy(finalPos);

    // Track actual distance for transparency logic
    const lookAtPos = new THREE.Vector3(playerPosition.x, playerPosition.y + TARGET_HEIGHT, playerPosition.z);
    currentDist = finalPos.distanceTo(lookAtPos);

    // Look at player center
    target.set(playerPosition.x, playerPosition.y + TARGET_HEIGHT, playerPosition.z);
    camera.lookAt(target);
  }

  function _checkCameraCollision(playerPos, desiredPos) {
    // Height Check: If the camera is significantly above the walls, bypass grid collision
    // MazeRenderer.WALL_H is usually 4.5
    const wallH = (typeof MazeRenderer !== 'undefined') ? MazeRenderer.WALL_H : 4.5;
    if (desiredPos.y > wallH + 0.5) return desiredPos;

    const margin = 0.8; // Increased margin for better safety against clipping
    const start  = new THREE.Vector3(playerPos.x, playerPos.y + TARGET_HEIGHT, playerPos.z);
    const end    = desiredPos;

    let low = 0, high = 1.0;
    const iterations = 15; // More iterations for higher precision

    for (let i = 0; i < iterations; i++) {
      const mid = (low + high) / 2;
      const tx  = start.x + (end.x - start.x) * mid;
      const ty  = start.y + (end.y - start.y) * mid;
      const tz  = start.z + (end.z - start.z) * mid;

      if (MazeCollision.canMoveTo(tx, tz, margin, ty)) {
        low = mid;
      } else {
        high = mid;
      }
    }

    // Use a slightly more conservative safety distance
    const MIN_SAFE = 0.4;

    // Smooth the safe distance transitions to prevent "popping"
    const safeDist = low * 0.98;

    return new THREE.Vector3(
      start.x + (end.x - start.x) * safeDist,
      start.y + (end.y - start.y) * safeDist,
      start.z + (end.z - start.z) * safeDist
    );
  }

  function getCamera()   { return camera; }
  function getDistance() { return currentDist; }

  return { init, update, getCamera, getDistance };
})();
