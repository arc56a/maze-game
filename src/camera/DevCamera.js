/**
 * DevCamera.js
 * Free-fly camera for developers to inspect the maze from above or any angle.
 * Controls: WASD to move, Space to go up, Shift to go down, Mouse to look.
 */

const DevCamera = (() => {
  let camera;
  let yaw = 0;
  let pitch = 0;
  const speed = 12;
  const sensitivity = 0.002;

  function init() {
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    camera.layers.enable(1); // Enable layer 1 to see the player mesh
    camera.position.set(0, 15, 0);
    camera.lookAt(5, 0, 5);
    console.log('[DevCamera] Initialized ✓');
  }

  function update(delta) {
    if (!camera) return;

    // 1. Rotation (Mouse)
    const deltaMouse = InputManager.consumeMouseDelta();
    yaw -= deltaMouse.dx * sensitivity;
    pitch -= deltaMouse.dy * sensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));

    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

    // 2. Movement
    const move = new THREE.Vector3();
    if (InputManager.moveForward()) move.z -= 1;
    if (InputManager.moveBackward()) move.z += 1;
    if (InputManager.moveLeft())    move.x -= 1;
    if (InputManager.moveRight())   move.x += 1;

    // Elevation
    if (InputManager.isDown('Space')) move.y += 1;
    if (InputManager.isDown('ShiftLeft') || InputManager.isDown('KeyC')) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize();
      // Apply camera rotation to movement vector
      move.applyQuaternion(camera.quaternion);

      const s = InputManager.isSprinting() ? speed * 3 : speed;
      camera.position.addScaledVector(move, s * delta);
    }
  }

  /**
   * Syncs dev camera to player position when activated
   */
  function sync(pos) {
    if (camera) {
      camera.position.copy(pos);
      camera.position.y += 5; // Start a bit above
      yaw = 0;
      pitch = -0.5;
    }
  }

  function getCamera() { return camera; }

  return { init, update, getCamera, sync };
})();
