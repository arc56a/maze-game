/**
 * SceneManager.js
 * Creates vibrant outdoor worlds: Sky, Sun, Clouds, Vast Terrain, and Nature
 */

const SceneManager = (() => {
  let ambientLight, sunLight, hemiLight;
  let skyDome, terrainMesh, natureGroup;
  let currentTheme = 'forest';
  let skyTextures = { day: null, night: null };

  let moonModel = null;
  let moonMixer = null;
  let moonClock = null;

  // ─── Setup Realistic Outdoor Environment ──────────────────
  async function setupLighting(theme = 'forest', startHour = 8.0) {
    currentTheme = theme;
    const scene = Engine.getScene();

    // Clear previous atmosphere/lights first so we do not stack multiple sun/moon lights
    if (typeof AtmosphereSystem !== 'undefined' && typeof AtmosphereSystem.dispose === 'function') {
      AtmosphereSystem.dispose();
    }
    clearScene(false);

    // 2. Setup Procedural Sky & Celestial Sprites
    if (typeof AtmosphereSystem !== 'undefined') {
      await AtmosphereSystem.init(startHour); // Starts at 8:00 AM
    }

    // 3. Terrain Ground
    _createVastTerrain(theme, _terrainColorForTheme(theme));

    console.log(`[SceneManager] Outdoor environment created ✓ (${theme} / Procedural Sky + 3D Moon)`);
  }

  function _terrainColorForTheme(theme) {
    return theme === 'desert' ? 0xd97706 : theme === 'ice' ? 0x7dd3fc : 0x3d7a3d;
  }

  function setSkyMode(mode = 'night') {
    // Mode is handled dynamically via AtmosphereSystem clock
  }

  // Update celestial position & lighting based on in-game time
  function updateTime(gameHour, delta = 0.016) {
    if (typeof AtmosphereSystem !== 'undefined') {
      AtmosphereSystem.setHour(gameHour, delta);
    }
  }

  function toggleVastTerrain(visible) {
    if (terrainMesh) terrainMesh.visible = visible;
  }

  // ─── 🌲 Vast Outdoor Terrain Ground ───────────────────────
  function _createVastTerrain(theme, baseColor) {
    const scene = Engine.getScene();
    if (terrainMesh) scene.remove(terrainMesh);

    // Procedural terrain texture
    const texture = _createTerrainTexture(theme);

    const terrainGeo = new THREE.PlaneGeometry(800, 800, 32, 32);
    terrainGeo.rotateX(-Math.PI / 2);

    const terrainMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.9,
      metalness: 0.05,
      color: 0xffffff,
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.position.set(50, -0.05, 50);
    terrainMesh.name = 'VastTerrain';
    scene.add(terrainMesh);
  }

  // ─── Procedural Ground Texture Generator ──────────────────
  function _createTerrainTexture(theme) {
    const canvas = document.createElement('canvas');
    canvas.width  = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (theme === 'desert') {
      // Warm desert sand texture
      ctx.fillStyle = '#d97706';
      ctx.fillRect(0, 0, 512, 512);

      // Sand ripples
      for (let i = 0; i < 500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        ctx.fillStyle = Math.random() > 0.5 ? '#b45309' : '#f59e0b';
        ctx.fillRect(x, y, Math.random() * 8 + 2, 2);
      }
    } else if (theme === 'ice') {
      // Ice/Snow terrain
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#bae6fd' : '#f8fafc';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 4, 4);
      }
    } else {
      // Lush forest grass terrain
      ctx.fillStyle = '#2d6a4f';
      ctx.fillRect(0, 0, 512, 512);

      // Grass variation
      for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const shades = ['#40916c', '#52b788', '#1b4332', '#74c69d'];
        ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)];
        ctx.fillRect(x, y, Math.random() * 4 + 1, Math.random() * 6 + 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    return tex;
  }

  // ─── Add Surrounding Nature Props (Optimized Instancing) ─────
  function addSurroundingNature(mazeWidth, mazeHeight, theme = 'forest') {
    const scene = Engine.getScene();
    if (natureGroup) {
      scene.remove(natureGroup);
      natureGroup.traverse(obj => {
        if (obj.isInstancedMesh) {
          obj.geometry.dispose();
          obj.material.dispose();
        }
      });
    }

    natureGroup = new THREE.Group();
    natureGroup.name = 'SurroundingNature';

    const margin = 10;
    const minX = -margin;
    const maxX = mazeWidth + margin;
    const minZ = -margin;
    const maxZ = mazeHeight + margin;

    const count = 120; // Increased density since it's now cheap!

    // Prepare Instance Data
    const pinePositions = [];
    const palmPositions = [];
    const rockPositions = [];

    for (let i = 0; i < count; i++) {
      let x, z;
      const side = Math.floor(Math.random() * 4);
      const dist = Math.random() * 80 + 12;

      if (side === 0) { x = Math.random() * (maxX - minX) + minX; z = minZ - dist; }
      else if (side === 1) { x = Math.random() * (maxX - minX) + minX; z = maxZ + dist; }
      else if (side === 2) { x = minX - dist; z = Math.random() * (maxZ - minZ) + minZ; }
      else { x = maxX + dist; z = Math.random() * (maxZ - minZ) + minZ; }

      const scale = Math.random() * 0.6 + 0.8;
      const rotation = Math.random() * Math.PI * 2;

      if (theme === 'desert') {
        if (Math.random() > 0.4) rockPositions.push({ x, z, scale, rotation, color: 0xb45309 });
        else palmPositions.push({ x, z, scale, rotation });
      } else {
        if (Math.random() > 0.3) pinePositions.push({ x, z, scale, rotation });
        else rockPositions.push({ x, z, scale, rotation, color: 0x475569 });
      }
    }

    // 1. Instanced Rocks
    if (rockPositions.length > 0) {
      const rockGeo = new THREE.DodecahedronGeometry(1, 0);
      const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
      const iRock = new THREE.InstancedMesh(rockGeo, rockMat, rockPositions.length);

      const dummy = new THREE.Object3D();
      rockPositions.forEach((p, i) => {
        dummy.position.set(p.x, p.scale * 0.4, p.z);
        dummy.rotation.set(Math.random(), p.rotation, Math.random());
        dummy.scale.set(p.scale * (Math.random() * 0.5 + 1), p.scale * 0.8, p.scale * (Math.random() * 0.5 + 1));
        dummy.updateMatrix();
        iRock.setMatrixAt(i, dummy.matrix);
        iRock.setColorAt(i, new THREE.Color(p.color));
      });
      natureGroup.add(iRock);
    }

    // 2. Instanced Pine Trees (Trunk + 3 Layers)
    if (pinePositions.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
      const iTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, pinePositions.length);

      const leafGeo = new THREE.ConeGeometry(1.8, 2, 6);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b4d3e, roughness: 0.8 });
      const iLeaves = [
        new THREE.InstancedMesh(leafGeo, leafMat, pinePositions.length),
        new THREE.InstancedMesh(leafGeo, leafMat, pinePositions.length),
        new THREE.InstancedMesh(leafGeo, leafMat, pinePositions.length)
      ];

      const dummy = new THREE.Object3D();
      pinePositions.forEach((p, i) => {
        // Trunk
        dummy.position.set(p.x, 1 * p.scale, p.z);
        dummy.rotation.set(0, p.rotation, 0);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        iTrunk.setMatrixAt(i, dummy.matrix);

        // Leaves Layers
        for (let j = 0; j < 3; j++) {
          dummy.position.set(p.x, (2.2 + j * 1.2) * p.scale, p.z);
          const s = (1.0 - j * 0.2) * p.scale;
          dummy.scale.set(s, p.scale, s);
          dummy.updateMatrix();
          iLeaves[j].setMatrixAt(i, dummy.matrix);
        }
      });

      [iTrunk, ...iLeaves].forEach(m => {
        natureGroup.add(m);
      });
    }

    // 3. Instanced Palm Trees (Trunk + 5 Leaves)
    if (palmPositions.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 4, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
      const iTrunk = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPositions.length);

      const leafGeo = new THREE.ConeGeometry(1.2, 0.4, 4);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
      const iLeaves = [];
      for(let k=0; k<5; k++) iLeaves.push(new THREE.InstancedMesh(leafGeo, leafMat, palmPositions.length));

      const dummy = new THREE.Object3D();
      palmPositions.forEach((p, i) => {
        dummy.position.set(p.x, 2 * p.scale, p.z);
        dummy.rotation.set(0, p.rotation, (Math.random() - 0.5) * 0.2);
        dummy.scale.set(p.scale, p.scale, p.scale);
        dummy.updateMatrix();
        iTrunk.setMatrixAt(i, dummy.matrix);

        for (let k = 0; k < 5; k++) {
          dummy.position.set(p.x, 4 * p.scale, p.z);
          dummy.rotation.set(0, p.rotation + (k * Math.PI * 2) / 5, Math.PI / 3);
          dummy.scale.set(p.scale, p.scale, p.scale);
          dummy.updateMatrix();
          iLeaves[k].setMatrixAt(i, dummy.matrix);
        }
      });

      [iTrunk, ...iLeaves].forEach(m => {
        natureGroup.add(m);
      });
    }

    scene.add(natureGroup);
  }

  // ─── Tree & Rock Geometries ───────────────────────────────
  function _createPineTree(group, x, z) {
    const tree = new THREE.Group();
    const scale = Math.random() * 0.6 + 0.8;

    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, 2 * scale, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1 * scale;
    tree.add(trunk);

    // Leaves layers
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b4d3e, roughness: 0.8 });
    for (let j = 0; j < 3; j++) {
      const coneGeo = new THREE.ConeGeometry((1.8 - j * 0.4) * scale, 2 * scale, 6);
      const cone = new THREE.Mesh(coneGeo, leafMat);
      cone.position.y = (2.2 + j * 1.2) * scale;
      tree.add(cone);
    }

    tree.position.set(x, 0, z);
    group.add(tree);
  }

  function _createPalmTree(group, x, z) {
    const tree = new THREE.Group();
    const scale = Math.random() * 0.5 + 0.8;

    // Curved Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const trunkGeo = new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 4 * scale, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2 * scale;
    trunk.rotation.z = (Math.random() - 0.5) * 0.2;
    tree.add(trunk);

    // Palm Top
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
    for (let k = 0; k < 5; k++) {
      const leafGeo = new THREE.ConeGeometry(1.2 * scale, 0.4 * scale, 4);
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(0, 4 * scale, 0);
      leaf.rotation.z = Math.PI / 3;
      leaf.rotation.y = (k * Math.PI * 2) / 5;
      tree.add(leaf);
    }

    tree.position.set(x, 0, z);
    group.add(tree);
  }

  function _createRock(group, x, z, color) {
    const rockMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const rockGeo = new THREE.DodecahedronGeometry(Math.random() * 0.8 + 0.6, 0);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, Math.random() * 0.4 + 0.3, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(Math.random() * 0.5 + 1, Math.random() * 0.5 + 0.8, Math.random() * 0.5 + 1);
    group.add(rock);
  }

  // ─── Clear Scene ──────────────────────────────────────────
  function clearScene(keepLights = false) {
    const scene = Engine.getScene();
    if (!scene) return;

    const preserveNames = [
      'SkyDome', 'ProceduralSky', 'VastTerrain', 'StarField',
      'MoonSurfaceGlow', 'MoonHalo', 'MoonLightTarget'
    ];

    const toRemove = [];
    scene.traverse(obj => {
      if (!obj || obj === scene) return;
      if (keepLights && obj.isLight) return;
      if (preserveNames.includes(obj.name)) return;
      toRemove.push(obj);
    });

    toRemove.forEach(obj => {
      if (obj.parent) obj.parent.remove(obj);
      if (obj.target && obj.target.parent) obj.target.parent.remove(obj.target);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose && m.dispose());
      }
      if (obj.isLight && obj.shadow && obj.shadow.map) {
        obj.shadow.map.dispose();
        obj.shadow.map = null;
      }
    });

    console.log('[SceneManager] Scene cleared ✓');
  }

  // ─── Fog ──────────────────────────────────────────────────
  function setFog(color = 0xbfdbfe, density = 0.008) {
    Engine.getScene().fog = new THREE.FogExp2(color, density);
  }

  // ─── Helpers ─────────────────────────────────────────────
  function add(object)    { Engine.getScene().add(object); }
  function remove(object) { Engine.getScene().remove(object); }

  return {
    setupLighting,
    setSkyMode,
    updateTime,
    addSurroundingNature,
    toggleVastTerrain,
    clearScene,
    setFog,
    add,
    remove
  };
})();
