/**
 * PropsManager.js
 * Manages game world objects like doors, tables, and obstacles.
 */

const PropsManager = (() => {
  const propsCache = {};

  /**
   * Loads all required prop models.
   */
  async function loadProps() {
    const assets = [
      { key: 'door', url: './assets/props/door.glb', type: 'gltf' },
    ];

    for (const asset of assets) {
      try {
        console.log(`[PropsManager] Attempting to load: ${asset.url}`);
        // Props like doors are shared across levels, load as global
        const gltf = await AssetLoader.loadGLTF(asset.url, true);
        propsCache[asset.key] = gltf;
        console.log(`[PropsManager] Successfully loaded prop: ${asset.key}`);
      } catch (err) {
        console.error(`[PropsManager] Critical error loading prop: ${asset.key}`, err);
      }
    }
  }

  /**
   * Places the exit door at the specified location.
   * Auto-detects the outer wall to snap against.
   */
  function placeExitDoor(group, col, row, theme) {
    const C = MazeRenderer.CELL_SIZE;
    const H = MazeRenderer.WALL_H;

    const wx_center = col * C + C / 2;
    const wz_center = row * C + C / 2;

    const doorAsset = propsCache['door'];
    if (!doorAsset) return false;

    const door = doorAsset.scene.clone();
    const bbox = new THREE.Box3().setFromObject(door);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const scaleFactor = (H * 0.72) / size.y;
    door.scale.setScalar(scaleFactor);

    // --- Smart Wall Snapping ---
    const isNorth = (row === 0);
    const isSouth = (row === MazeRenderer.lastRows - 1);
    const isWest  = (col === 0);
    const isEast  = (col === MazeRenderer.lastCols - 1);

    let finalX = wx_center;
    let finalZ = wz_center;
    let finalRot = 0;

    if (isEast) {
      finalX = (col + 1) * C - 0.42;
      finalRot = -Math.PI / 2;
    } else if (isWest) {
      finalX = col * C + 0.42;
      finalRot = Math.PI / 2;
    } else if (isSouth) {
      finalZ = (row + 1) * C - 0.42;
      finalRot = Math.PI;
    } else if (isNorth) {
      finalZ = row * C + 0.42;
      finalRot = 0;
    }

    door.position.set(finalX, 0, finalZ);
    door.rotation.y = finalRot;

    door.traverse(node => {
      if (node.isMesh) {
      }
    });

    group.add(door);

    // Add a green light in front of the door
    const lx = finalX + Math.sin(finalRot) * 0.8;
    const lz = finalZ + Math.cos(finalRot) * 0.8;
    _addDoorLight(group, lx, lz);

    return true;
  }

  /**
   * Places a wall torch with flickering fire light.
   */
  function placeWallTorch(group, x, y, z, rotY) {
    const torchGroup = new THREE.Group();
    torchGroup.position.set(x, y, z);
    torchGroup.rotation.y = rotY;

    // 1. Procedural Torch Bracket (Placeholder)
    const bracketGeo = new THREE.BoxGeometry(0.1, 0.4, 0.2);
    const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.5 });
    const bracket = new THREE.Mesh(bracketGeo, bracketMat);
    torchGroup.add(bracket);

    const handleGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.6);
    const handle = new THREE.Mesh(handleGeo, bracketMat);
    handle.rotation.x = -Math.PI / 4;
    handle.position.set(0, 0.1, 0.15);
    torchGroup.add(handle);

    // 2. Dynamic Light (Using LightSystem)
    if (typeof LightSystem !== 'undefined') {
      const fl = LightSystem.create('fire', {
        intensity: 25,
        distance: 12,
        decay: 1.5,
        flickerSpeed: 0.12,
        flickerStrength: 0.35,
        jitter: 0.08
      });
      // Position relative to torch tip
      fl.position.set(0, 0.4, 0.35);
      torchGroup.add(fl);
    }

    group.add(torchGroup);
    return torchGroup;
  }

  /**
   * Places a ceiling or wall lamp with steady light.
   */
  function placeLamp(group, x, y, z, options = {}) {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(x, y, z);

    // Simple Procedural Lamp
    const bulbGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.0
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    lampGroup.add(bulb);

    if (typeof LightSystem !== 'undefined') {
      const light = LightSystem.create(options.type || 'lamp', {
        color: options.color || 0xfffaf0,
        intensity: options.intensity || 15,
        distance: options.distance || 10,
        isStatic: options.isStatic || false
      });
      lampGroup.add(light);
    }

    group.add(lampGroup);
    return lampGroup;
  }

  /**
   * Places a directed spotlight.
   */
  function placeSpotlight(group, x, y, z, targetPos, options = {}) {
    if (typeof LightSystem === 'undefined') return null;

    const spot = LightSystem.create('spot', {
      color: options.color || 0xffffff,
      intensity: options.intensity || 80,
      distance: options.distance || 25,
      angle: options.angle || Math.PI / 8,
      penumbra: 0.5,
      flickerStrength: options.flicker || 0
    });

    spot.position.set(x, y, z);

    if (targetPos) {
      spot.target.position.copy(targetPos);
      group.add(spot.target);
    }

    group.add(spot);
    return spot;
  }

  function placeExitDoorWorld(group, x, y, z, rot) {
    const doorAsset = propsCache['door'];
    if (!doorAsset) return false;

    const door = doorAsset.scene.clone();
    const bbox = new THREE.Box3().setFromObject(door);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    const scaleFactor = (MazeRenderer.WALL_H * 0.72) / size.y;
    door.scale.setScalar(scaleFactor);

    door.position.set(x, y || 0, z);
    door.rotation.y = rot || 0;

    door.traverse(node => { if (node.isMesh) { } });
    group.add(door);

    _addDoorLight(group, x + Math.sin(rot) * 0.8, z + Math.cos(rot) * 0.8);
    return true;
  }

  function _addDoorLight(group, x, z) {
    const light = new THREE.PointLight(0x22c55e, 12, 6);
    light.position.set(x, 1.5, z);
    group.add(light);

    Engine.onUpdate((dt, elapsed) => {
      light.intensity = 10 + Math.sin(elapsed * 4) * 4;
    });
  }

  /**
   * Future: placeTable, placeObstacle, etc.
   */

  return {
    loadProps,
    placeExitDoor,
    placeExitDoorWorld,
    placeWallTorch,
    placeLamp,
    placeSpotlight
  };
})();
