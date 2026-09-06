/**
 * MazeRenderer.js
 * Converts maze grid → Three.js geometry (walls, floor, ceiling, props)
 * Featuring PBR Earth floor and scattered 3D Grass
 */

const MazeRenderer = (() => {
  const CELL_SIZE  = 8.5;  // Increased for mobile maneuverability
  const WALL_H     = 4.5;
  const WALL_T     = 0.9;  // Slightly thicker for the new scale

  let mazeGroup = null;
  const textureCache = {};
  let pbrWallMaterial = null;
  let grassModel = null;
  let wallPlantDefinitions = []; // Stores { parts: [{geometry, material}], type: 'vines'|'twine' }
  let pbrLoaded = false;

  // ─── PBR Texture & Model Loading ──────────────────────────
  async function loadPBRTextures(theme) {
    if (pbrLoaded) return; // Instantly return if assets are already loaded
    pbrLoaded = true;

    const wallPath = 'assets/textures/wall/';
    const floorPath = 'assets/textures/floor/';

    // 1. Extract Wall Material from GLB (Shared across levels)
    try {
      const gltf = await AssetLoader.loadGLTF(wallPath + 'stone_castle_wall_material_01.glb', true);
      gltf.scene.traverse(node => {
        if (node.isMesh && !pbrWallMaterial) {
          pbrWallMaterial = node.material.clone();
          pbrWallMaterial.side = THREE.DoubleSide; // Ensure double-sided for shared PBR material
          const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
          maps.forEach(m => {
            if (pbrWallMaterial[m]) {
              pbrWallMaterial[m].wrapS = pbrWallMaterial[m].wrapT = THREE.RepeatWrapping;
              pbrWallMaterial[m].anisotropy = 4;
            }
          });
        }
      });
    } catch (e) {}

    // 2. Load New Earthy Floor Textures (Shared across levels)
    try {
      const gPath = floorPath + 'Ground109_1K-JPG/';
      const assets = [
        { key: 'f_c', url: gPath + 'Ground109_1K-JPG_Color.jpg' },
        { key: 'f_n', url: gPath + 'Ground109_1K-JPG_NormalGL.jpg' },
        { key: 'f_r', url: gPath + 'Ground109_1K-JPG_Roughness.jpg' },
        { key: 'f_ao', url: gPath + 'Ground109_1K-JPG_AmbientOcclusion.jpg' }
      ];
      for (const a of assets) {
        const tex = await AssetLoader.loadTexture(a.url, true);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        textureCache[a.key] = tex;
      }
    } catch(e) {}

    // 3. Load Grass Model for scattering (Shared across levels)
    try {
      const gltf = await AssetLoader.loadGLTF(floorPath + 'grass mix by Steve B - 2zt43AlwVoI.glb', true);
      gltf.scene.traverse(node => {
        if (node.isMesh && !grassModel) {
          grassModel = node;
          grassModel.geometry.computeBoundingBox();
          if (grassModel.material) {
            grassModel.material.side = THREE.DoubleSide;
            grassModel.material.alphaTest = 0.5;
          }
        }
      });
    } catch (e) {}

    // 4. Load Wall Plants (Shared across levels)
    wallPlantDefinitions = [];
    const plantFiles = [
      { name: 'Twine by Jakob Hippe - 4zh_zKCArUW.glb', type: 'twine' },
      { name: 'vines.glb', type: 'vines' }
    ];

    for (const file of plantFiles) {
      try {
        const gltf = await AssetLoader.loadGLTF(floorPath + file.name, true);
        gltf.scene.updateMatrixWorld(true);

        // Overall Bounding Box
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Group meshes by material for high-performance merging
        const matGroups = new Map();
        gltf.scene.traverse(node => {
          if (node.isMesh && node.geometry) {
            const mat = node.material;
            if (!matGroups.has(mat)) {
              matGroups.set(mat, []);
            }
            const geom = node.geometry.clone();
            geom.applyMatrix4(node.matrixWorld);
            matGroups.get(mat).push(geom);
          }
        });

        const parts = [];
        for (const [origMat, geoms] of matGroups.entries()) {
          if (!geoms || geoms.length === 0) continue;

          let mergedGeom;
          if (geoms.length === 1) {
            mergedGeom = geoms[0];
          } else if (THREE.BufferGeometryUtils?.mergeGeometries) {
            mergedGeom = THREE.BufferGeometryUtils.mergeGeometries(geoms, false);
          } else {
            mergedGeom = geoms[0];
          }

          if (!mergedGeom) continue;

          // Normalize Merged Geometry:
          // 1. Center X & Y around origin
          // 2. Set Z-min to 0 so the back of the vine sits flush against the wall surface
          mergedGeom.translate(-center.x, -center.y, -box.min.z);

          const mat = origMat.clone();
          mat.side = THREE.DoubleSide;
          mat.alphaTest = 0.45;
          mat.transparent = true;
          mat.depthWrite = true;

          // Realistic botanical tinting
          if (file.type === 'vines') {
            mat.color.multiplyScalar(0.95);
          } else {
            mat.color.multiplyScalar(0.7);
          }

          parts.push({
            geometry: mergedGeom,
            material: mat
          });
        }

        if (parts.length > 0) {
          wallPlantDefinitions.push({ parts, type: file.type, originalSize: size });
          console.log(`[MazeRenderer] Loaded plant "${file.type}" with ${parts.length} merged part(s).`);
        }
      } catch (e) {
        console.warn(`[MazeRenderer] Plant load fail: ${file.name}`, e);
      }
    }
  }

  function buildMaterials(theme) {
    const wallMat = pbrWallMaterial ? pbrWallMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x334155, side: THREE.DoubleSide });
    if (pbrWallMaterial) {
      wallMat.side = THREE.DoubleSide;
      const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
      maps.forEach(m => { if (wallMat[m]) { wallMat[m] = wallMat[m].clone(); wallMat[m].repeat.set(2, 1); } });
    }

    let pillarMat = pbrWallMaterial ? pbrWallMaterial.clone() : new THREE.MeshStandardMaterial({ color: 0x1e293b, side: THREE.DoubleSide });
    if (pbrWallMaterial) {
      pillarMat.side = THREE.DoubleSide;
      pillarMat.color.multiplyScalar(1.1); // 80% infusion feel
      const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
      maps.forEach(m => { if (pillarMat[m]) { pillarMat[m] = pillarMat[m].clone(); pillarMat[m].repeat.set(0.5, 2); } });
    }

    // Ground Material (Earthy)
    const floorMat = new THREE.MeshStandardMaterial({
      map: textureCache['f_c'],
      normalMap: textureCache['f_n'],
      roughnessMap: textureCache['f_r'],
      aoMap: textureCache['f_ao'],
      roughness: 1.0,
      side: THREE.DoubleSide
    });
    if (textureCache['f_c']) {
      [floorMat.map, floorMat.normalMap, floorMat.roughnessMap, floorMat.aoMap].forEach(t => {
        if(t) t.repeat.set(2, 2);
      });
    }

    return { wall: wallMat, pillar: pillarMat, floor: floorMat };
  }

  async function build(mazeData, theme = 'forest') {
    const { grid, cols, rows } = mazeData;
    const def = mazeData.levelDef;
    const isStatic = !!(def && def.isStatic);
    const mat = buildMaterials(theme);

    if (mazeGroup) { SceneManager.remove(mazeGroup); mazeGroup.traverse(o => o.geometry?.dispose()); }
    mazeGroup = new THREE.Group();
    mazeGroup.name = 'Maze';

    const wallGeos = [], pillarGeos = [];
    const C = CELL_SIZE, H = WALL_H, T = WALL_T, PW = T * 1.3;

    if (!isStatic) {
      // 1. Solid PBR Earth Floor
      const floorGeo = new THREE.PlaneGeometry(cols * C, rows * C);
      floorGeo.rotateX(-Math.PI / 2);
      floorGeo.translate((cols * C) / 2, -0.05, (rows * C) / 2);
      const floorMesh = new THREE.Mesh(floorGeo, mat.floor);
      floorMesh.receiveShadow = true;
      mazeGroup.add(floorMesh);

      // 2. Scatter Grass (3D Model / High Performance Tufts)
      const grassGeo = grassModel ? grassModel.geometry : new THREE.ConeGeometry(0.04, 0.4, 4);
      if (!grassModel) grassGeo.translate(0, 0.2, 0);
      const grassMat = grassModel ? grassModel.material : new THREE.MeshStandardMaterial({
        color: 0x38a169,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      const grassCount = cols * rows * 12;
      const instancedGrass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
      instancedGrass.name = 'InstancedGrass';
      instancedGrass.visible = (window.Settings ? Settings.get('grass') !== false : true);

      instancedGrass.castShadow = false;
      instancedGrass.receiveShadow = false;
      instancedGrass.matrixAutoUpdate = false;

      const dummy = new THREE.Object3D();
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for(let i = 0; i < 12; i++) {
            const rx = (c * C) + (Math.random() * (C - 0.6) + 0.3);
            const rz = (r * C) + (Math.random() * (C - 0.6) + 0.3);
            dummy.position.set(rx, 0, rz);
            dummy.rotation.y = Math.random() * Math.PI * 2;

            const sBase = 0.5 + Math.random() * 0.35;
            const sTall = 1.1 + Math.random() * 0.5;
            dummy.scale.set(sBase, sBase * sTall, sBase);

            dummy.updateMatrix();
            instancedGrass.setMatrixAt(idx++, dummy.matrix);
          }
        }
      }
      instancedGrass.instanceMatrix.needsUpdate = true;
      mazeGroup.add(instancedGrass);
    }

    // 3. Junction Pillars (Grid Based) - Creates smooth rounded corners
    if (!isStatic && grid && grid.length > 0) {
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const px = c * C, pz = r * C;
          // Cylinder at junction with radius matching half wall thickness
          // This makes corners appear rounded while straight sections stay flat
          const pGeo = new THREE.CylinderGeometry(T / 2, T / 2, H, 12);
          pGeo.translate(px, H / 2, pz);
          pillarGeos.push(pGeo);
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * C, z = r * C, cell = grid[r][c];
          // Use sharp boxes for segments to allow perfect tiling
          if (!(cell & MazeGenerator.N)) {
            const g = new THREE.BoxGeometry(C + 0.1, H, T);
            g.translate(x + C / 2, H / 2, z);
            wallGeos.push(g);
          }
          if (!(cell & MazeGenerator.W)) {
            const g = new THREE.BoxGeometry(T, H, C + 0.1);
            g.translate(x, H / 2, z + C / 2);
            wallGeos.push(g);
          }
          if (r === rows - 1 && !(cell & MazeGenerator.S)) {
            const g = new THREE.BoxGeometry(C + 0.1, H, T);
            g.translate(x + C / 2, H / 2, z + C);
            wallGeos.push(g);
          }
          if (c === cols - 1 && !(cell & MazeGenerator.E)) {
            const g = new THREE.BoxGeometry(T, H, C + 0.1);
            g.translate(x + C, H / 2, z + C / 2);
            wallGeos.push(g);
          }
        }
      }
    }

    // 3.5. Professional Freeform Objects (Studio Export)
    if (def && def.isStatic) {
      const isV2 = def.version === '2.0';
      const assets = def.assets || { textures: [], models: [] };
      const rawTextures = assets.textures || [];
      const rawModels = assets.models || [];

      // 1. Parallel Preload all unique textures and models for the level
      const texPromises = rawTextures.map(async (tUrl, i) => {
        if (!tUrl) return null;
        try {
          const t = await AssetLoader.loadTexture(tUrl);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = THREE.SRGBColorSpace;
          return { key: `@t${i}`, url: tUrl, tex: t };
        } catch (e) {
          console.warn('[MazeRenderer] Texture preload failed:', i, e);
          return null;
        }
      });

      const modelPromises = rawModels.map(async (mUrl, i) => {
        if (!mUrl) return null;
        try {
          // Log only the start of the URL/Base64 for cleaner console
          const logUrl = (typeof mUrl === 'string' && mUrl.startsWith('data:')) ? mUrl.substring(0, 48) + '...' : mUrl;
          const gltf = await AssetLoader.loadGLTF(mUrl);
          return { key: `@m${i}`, url: mUrl, gltf: gltf };
        } catch (e) {
          console.warn('[MazeRenderer] Model preload failed:', i, e);
          return null;
        }
      });

      const [loadedTexResults, loadedModelResults] = await Promise.all([
        Promise.all(texPromises),
        Promise.all(modelPromises)
      ]);

      const texMap = new Map();
      loadedTexResults.forEach(r => {
        if (r) {
          texMap.set(r.key, r.tex);
          texMap.set(r.url, r.tex);
        }
      });

      const modelMap = new Map();
      loadedModelResults.forEach(r => {
        if (r) {
          modelMap.set(r.key, r.gltf);
          modelMap.set(r.url, r.gltf);
        }
      });

      const getTexture = (ref) => {
        if (!ref) return null;
        return texMap.get(ref) || AssetLoader.get(ref) || null;
      };

      const getModel = (ref) => {
        if (!ref) return null;
        return modelMap.get(ref) || AssetLoader.get(ref) || null;
      };

      const plainWallMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
      const plainFloorMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.9, metalness: 0, shadowSide: THREE.DoubleSide, side: THREE.DoubleSide });

      // 2. Build Walls
      const walls = def.freeWalls || [];
      for (const w of walls) {
        const frontModelRef = w.cm ?? w.customModel;
        const backModelRef = w.bcm ?? w.backCustomModel;
        const isDualSided = (w.ds ?? w.doubleSided) !== false || !!backModelRef;

        if (frontModelRef || backModelRef) {
          const frontGltf = frontModelRef ? getModel(frontModelRef) : null;
          const backGltf = backModelRef ? getModel(backModelRef) : null;
          const primaryGltf = frontGltf || backGltf;

          if (primaryGltf && primaryGltf.scene) {
            const container = new THREE.Group();
            const targetW = w.width ?? w.w ?? 7.0;
            const targetH = w.height ?? w.h ?? 4.5;
            const targetT = w.thickness ?? w.t ?? 0.4;
            const scaleMul = w.scale ?? w.s ?? 1.0;

            const setupInstance = (gltfScene) => {
              const model = gltfScene.clone();
              const box = new THREE.Box3().setFromObject(model);
              const size = new THREE.Vector3();
              box.getSize(size);
              const center = new THREE.Vector3();
              box.getCenter(center);
              if (size.x <= 0.001) size.x = 1.0;
              if (size.y <= 0.001) size.y = 1.0;
              if (size.z <= 0.001) size.z = 1.0;
              if (size.z > size.x * 1.5) {
                model.rotation.y = Math.PI / 2;
                box.setFromObject(model);
                box.getSize(size);
                box.getCenter(center);
              }
              model.position.x = -center.x;
              model.position.y = -box.min.y;
              model.position.z = -center.z;
              const wrapper = new THREE.Group();
              wrapper.add(model);
              return { wrapper, size };
            };

            if (isDualSided) {
              const halfT = targetT / 2;

              // 1. Front Instance (faces outward to +Z)
              const fScene = (frontGltf && frontGltf.scene) ? frontGltf.scene : primaryGltf.scene;
              const frontInst = setupInstance(fScene);
              frontInst.wrapper.scale.set(
                (targetW / frontInst.size.x) * scaleMul,
                (targetH / frontInst.size.y) * scaleMul,
                (halfT / Math.max(frontInst.size.z, 0.02)) * scaleMul
              );
              frontInst.wrapper.position.set(0, 0, (halfT / 2) * scaleMul);
              container.add(frontInst.wrapper);

              // 2. Back Instance (faces outward to -Z, rotated 180° on Y)
              const bScene = (backGltf && backGltf.scene) ? backGltf.scene : primaryGltf.scene;
              const backInst = setupInstance(bScene);
              backInst.wrapper.rotation.y = Math.PI;
              backInst.wrapper.scale.set(
                (targetW / backInst.size.x) * scaleMul,
                (targetH / backInst.size.y) * scaleMul,
                (halfT / Math.max(backInst.size.z, 0.02)) * scaleMul
              );
              backInst.wrapper.position.set(0, 0, -(halfT / 2) * scaleMul);
              container.add(backInst.wrapper);
            } else {
              const singleInst = setupInstance(primaryGltf.scene);
              singleInst.wrapper.scale.set(
                (targetW / singleInst.size.x) * scaleMul,
                (targetH / singleInst.size.y) * scaleMul,
                (targetT / Math.max(singleInst.size.z, 0.05)) * scaleMul
              );
              container.add(singleInst.wrapper);
            }

            container.position.set(w.x ?? 0, w.y ?? 0, w.z ?? 0);
            container.rotation.set(w.rotX ?? w.rx ?? 0, w.rotY ?? w.ry ?? 0, w.rotZ ?? w.rz ?? 0, 'YXZ');

            container.traverse(c => {
              if (c.isMesh && c.material) {
                c.castShadow = true;
                c.receiveShadow = true;
                const ensureDouble = (m) => {
                  if (m) {
                    m.side = THREE.DoubleSide;
                    m.shadowSide = THREE.DoubleSide;
                  }
                };
                if (Array.isArray(c.material)) c.material.forEach(ensureDouble);
                else ensureDouble(c.material);
              }
            });
            mazeGroup.add(container);
            continue;
          }
        }

        const width = w.width ?? w.w ?? 1;
        const height = w.height ?? w.h ?? WALL_H;
        const thickness = w.thickness ?? w.t ?? WALL_T;
        const x = w.x, y = w.y || 0, z = w.z;
        const rx = w.rotX ?? w.rx ?? 0;
        const ry = w.rotY ?? w.ry ?? 0;
        const rz = w.rotZ ?? w.rz ?? 0;
        const variant = w.v ?? w.variant ?? 'standard';
        const topVar = w.tv ?? w.topVariant ?? 'none';

        const hasPillars = !!(w.hp ?? w.hasPillars);
        const hasPanels  = !!(w.hpa ?? w.hasPanels);
        const hasCarving = !!(w.hc ?? w.hasCarving);

        const texObj = getTexture(w.customTex ?? w.tx);
        let wallMat = plainWallMat;
        if (texObj) {
          const tClone = texObj.clone();
          tClone.wrapS = tClone.wrapT = THREE.RepeatWrapping;
          tClone.repeat.set(w.texRepeatX ?? w.rxp ?? 2, w.texRepeatY ?? w.ryp ?? 1);
          tClone.needsUpdate = true;
          wallMat = new THREE.MeshStandardMaterial({
            map: tClone,
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide
          });
        }

        const dtexObj = getTexture(w.decorTex ?? w.dtx);
        let decorMat = wallMat;
        if (dtexObj) {
          const dtClone = dtexObj.clone();
          dtClone.wrapS = dtClone.wrapT = THREE.RepeatWrapping;
          dtClone.repeat.set(1, 1);
          dtClone.needsUpdate = true;
          decorMat = new THREE.MeshStandardMaterial({
            map: dtClone,
            color: 0xffffff,
            roughness: 0.6,
            metalness: 0.2,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide
          });
        }

        const mesh = new THREE.Group();
        const radius = thickness / 2;

        // Optimized wall joint / fillet check using direct scalar distance (no GC allocations)
        const wsX = x - Math.cos(ry) * width / 2;
        const wsZ = z + Math.sin(ry) * width / 2;
        const weX = x + Math.cos(ry) * width / 2;
        const weZ = z - Math.sin(ry) * width / 2;
        let roundS = false, roundE = false, hasTop = false;

        for (let j = 0; j < walls.length; j++) {
          const o = walls[j];
          if (o === w) continue;
          const oX = o.x ?? 0, oZ = o.z ?? 0, oW = (o.w ?? o.width ?? 1), oR = o.ry ?? o.rotY ?? 0, oY = o.y ?? 0;
          const osX = oX - Math.cos(oR) * oW / 2;
          const osZ = oZ + Math.sin(oR) * oW / 2;
          const oeX = oX + Math.cos(oR) * oW / 2;
          const oeZ = oZ - Math.sin(oR) * oW / 2;

          if (((wsX - osX) ** 2 + (wsZ - osZ) ** 2 < 0.04) || ((wsX - oeX) ** 2 + (wsZ - oeZ) ** 2 < 0.04)) roundS = true;
          if (((weX - osX) ** 2 + (weZ - osZ) ** 2 < 0.04) || ((weX - oeX) ** 2 + (weZ - oeZ) ** 2 < 0.04)) roundE = true;
          if (Math.abs(oX - x) < 0.2 && Math.abs(oZ - z) < 0.2 && oY > y + 0.1) hasTop = true;
        }
        (def.freeFloors || []).forEach(f => {
          if (Math.abs(f.x - x) < width / 2 && Math.abs(f.z - z) < width / 2 && f.y > y + 0.1) hasTop = true;
        });

        // Filleted Wall Body
        const boxH = height - (hasTop ? 0 : radius);
        const offsetY = hasTop ? 0 : -radius / 2;

        if (variant === 'arch') {
          const sideW = width * 0.2, topH = height * 0.25;
          const left = new THREE.Mesh(new THREE.BoxGeometry(sideW, boxH, thickness), wallMat);
          left.position.set(-width/2 + sideW/2, offsetY, 0);
          const right = new THREE.Mesh(new THREE.BoxGeometry(sideW, boxH, thickness), wallMat);
          right.position.set(width/2 - sideW/2, offsetY, 0);
          const top = new THREE.Mesh(new THREE.BoxGeometry(width, topH, thickness), wallMat);
          top.position.y = height/2 - topH/2;
          mesh.add(left, right, top);
        } else if (variant === 'window') {
          const b = width * 0.15;
          const p1 = new THREE.Mesh(new THREE.BoxGeometry(width, b, thickness), wallMat); p1.position.y = -height/2 + b/2;
          const p2 = new THREE.Mesh(new THREE.BoxGeometry(width, b, thickness), wallMat); p2.position.y = height/2 - b/2;
          const p3 = new THREE.Mesh(new THREE.BoxGeometry(b, boxH, thickness), wallMat); p3.position.set(-width/2 + b/2, offsetY, 0);
          const p4 = new THREE.Mesh(new THREE.BoxGeometry(b, boxH, thickness), wallMat); p4.position.set(width/2 - b/2, offsetY, 0);
          mesh.add(p1, p2, p3, p4);
        } else {
          const wallBody = new THREE.Mesh(new THREE.BoxGeometry(width, boxH, thickness), wallMat);
          wallBody.position.y = offsetY;
          mesh.add(wallBody);
        }

        // Embedded joints at connected endpoints
        const vJointH = height - (hasTop ? 0 : radius);
        const vJointGeo = new THREE.CylinderGeometry(radius, radius, vJointH, 12);
        const topJointGeo = new THREE.CylinderGeometry(radius, radius, width, 12).rotateZ(Math.PI / 2);
        const cornerGeo = new THREE.SphereGeometry(radius, 12, 12);
        const jointY = hasTop ? 0 : -radius / 2;

        if (roundS) {
          const startJoint = new THREE.Mesh(vJointGeo, wallMat);
          startJoint.position.set(-width / 2, jointY, 0);
          mesh.add(startJoint);
        }
        if (roundE) {
          const endJoint = new THREE.Mesh(vJointGeo, wallMat);
          endJoint.position.set(width / 2, jointY, 0);
          mesh.add(endJoint);
        }
        if (!hasTop) {
          const topJoint = new THREE.Mesh(topJointGeo, wallMat);
          topJoint.position.y = height / 2 - radius;
          mesh.add(topJoint);
          if (roundS) {
            const startCorner = new THREE.Mesh(cornerGeo, wallMat);
            startCorner.position.set(-width / 2, height / 2 - radius, 0);
            mesh.add(startCorner);
          }
          if (roundE) {
            const endCorner = new THREE.Mesh(cornerGeo, wallMat);
            endCorner.position.set(width / 2, height / 2 - radius, 0);
            mesh.add(endCorner);
          }
        }

        // Decoration Layers
        if (hasPillars) {
          const pW = thickness * 1.8;
          const leftP = new THREE.Mesh(new THREE.BoxGeometry(pW, height * 1.05, pW), decorMat);
          leftP.position.x = -width/2;
          const rightP = new THREE.Mesh(new THREE.BoxGeometry(pW, height * 1.05, pW), decorMat);
          rightP.position.x = width/2;
          mesh.add(leftP, rightP);
        }

        if (hasPanels) {
          const panelW = width * 0.35, panelH = height * 0.7;
          const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, thickness * 1.3), decorMat);
          leftPanel.position.x = -width * 0.22;
          const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, thickness * 1.3), decorMat);
          rightPanel.position.x = width * 0.22;
          mesh.add(leftPanel, rightPanel);
        }

        if (hasCarving) {
          const decor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, height * 0.4, thickness * 1.5), decorMat);
          mesh.add(decor);
        }

        // Top Trim Logic
        if (topVar === 'trim') {
          const trimH = 0.4;
          const trim = new THREE.Mesh(new THREE.BoxGeometry(width * 1.05, trimH, thickness * 1.4), decorMat);
          trim.position.y = height/2 + trimH/2;
          mesh.add(trim);
        } else if (topVar === 'castle') {
          const cW = width / 5, cH = 0.6;
          for(let i=0; i<5; i++) if(i % 2 === 0) {
            const block = new THREE.Mesh(new THREE.BoxGeometry(cW, cH, thickness), decorMat);
            block.position.set(-width/2 + cW/2 + i*cW, height/2 + cH/2, 0);
            mesh.add(block);
          }
        } else if (topVar === 'spikes') {
          const sSize = width / 8;
          for(let i=0; i<8; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(sSize/2, 0.8, 4), decorMat);
            spike.position.set(-width/2 + sSize/2 + i*sSize, height/2 + 0.4, 0);
            mesh.add(spike);
          }
        }

        mesh.position.set(x, y + height / 2, z);
        mesh.rotation.set(rx, ry, rz, 'YXZ');
        mesh.scale.setScalar(w.scale ?? w.s ?? 1.0);
        mesh.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        mazeGroup.add(mesh);
      }

      // 3. Build Floors
      for (const f of (def.freeFloors || [])) {
        const floorModelRef = f.customModel ?? f.cm;
        if (floorModelRef) {
          const gltf = getModel(floorModelRef);
          if (gltf && gltf.scene) {
            const container = new THREE.Group();
            const model = gltf.scene.clone();

            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            if (size.x <= 0.001) size.x = 1.0;
            if (size.y <= 0.001) size.y = 1.0;
            if (size.z <= 0.001) size.z = 1.0;

            model.position.x = -center.x;
            model.position.z = -center.z;
            const isActuallyCeiling = f.isCeiling || f.ic;
            if (isActuallyCeiling) {
              model.position.y = -box.min.y;
            } else {
              model.position.y = -box.max.y;
            }
            container.add(model);

            const targetW = f.width ?? f.w ?? 7.0;
            const targetD = f.depth ?? f.d ?? 7.0;
            const targetT = f.thickness ?? f.t ?? 0.4;
            const scaleMul = f.scale ?? f.s ?? 1.0;

            let scaleY = scaleMul;
            if (size.y >= 0.02) {
              scaleY = (targetT / size.y) * scaleMul;
            }

            container.scale.set(
              (targetW / size.x) * scaleMul,
              scaleY,
              (targetD / size.z) * scaleMul
            );

            container.position.set(f.x ?? 0, f.y ?? 0, f.z ?? 0);
            container.rotation.set(f.rotX ?? f.rx ?? 0, f.rotY ?? f.ry ?? 0, f.rotZ ?? f.rz ?? 0, 'YXZ');

            container.traverse(c => {
              if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
                if (c.material) {
                  const mats = Array.isArray(c.material) ? c.material : [c.material];
                  mats.forEach(m => { if (m) m.side = THREE.DoubleSide; });
                }
              }
            });
            mazeGroup.add(container);
            continue;
          }
        }

        const width = f.width ?? f.w ?? 1;
        const depth = f.depth ?? f.d ?? 1;
        const thickness = f.thickness ?? f.t ?? 0.4;
        const x = f.x, y = f.y || 0, z = f.z;
        const rx = f.rotX ?? f.rx ?? 0;
        const ry = f.rotY ?? f.ry ?? 0;
        const rz = f.rotZ ?? f.rz ?? 0;

        const fTexObj = getTexture(f.customTex ?? f.tx);
        let floorMat = plainFloorMat;
        if (fTexObj) {
          const ftClone = fTexObj.clone();
          ftClone.wrapS = ftClone.wrapT = THREE.RepeatWrapping;
          ftClone.repeat.set(f.texRepeatX ?? f.rxp ?? 1, f.texRepeatY ?? f.ryp ?? 1);
          ftClone.needsUpdate = true;
          floorMat = new THREE.MeshStandardMaterial({
            map: ftClone,
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0,
            side: THREE.DoubleSide,
            shadowSide: THREE.DoubleSide
          });
        }

        const geo = new THREE.BoxGeometry(width, thickness, depth);
        const mesh = new THREE.Mesh(geo, floorMat);
        mesh.position.set(x, y - thickness / 2, z);
        mesh.rotation.set(rx, ry, rz, 'YXZ');
        mesh.scale.setScalar(f.scale ?? f.s ?? 1.0);
        mesh.castShadow = true; // Essential for ceilings to block sun/moon
        mesh.receiveShadow = true;
        mazeGroup.add(mesh);
      }

      // 4. Build Custom GLB Models
      for (const m of (def.customModels || [])) {
        const gltf = getModel(m.modelData ?? m.d);
        if (!gltf || !gltf.scene) continue;

        const model = gltf.scene.clone();
        model.position.set(m.x ?? 0, m.y ?? 0, m.z ?? 0);

        const rx = m.rotX ?? m.rx ?? 0;
        const ry = m.rotY ?? m.ry ?? 0;
        const rz = m.rotZ ?? m.rz ?? 0;
        model.rotation.set(rx, ry, rz, 'YXZ');

        const s = m.scale ?? m.s ?? 1.0;
        model.scale.setScalar(s);

        // Apply Tint color if defined
        const tintHex = m.tint ?? m.t;
        if (tintHex && tintHex !== '#ffffff') {
          const tintColor = new THREE.Color(tintHex);
          model.traverse(c => {
            if (c.isMesh && c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach(mat => {
                if (m) {
                  mat.color.multiply(tintColor);
                  mat.needsUpdate = true;
                }
              });
            }
          });
        }

        model.traverse(c => {
          if (c.isMesh && c.material) {
            c.castShadow = true;
            c.receiveShadow = true;
            const ensureDouble = (m) => { if (m) m.side = THREE.DoubleSide; };
            if (Array.isArray(c.material)) c.material.forEach(ensureDouble);
            else ensureDouble(c.material);
          }
        });
        mazeGroup.add(model);
      }

      // 5. Props (Pillars, Doors, etc)
      for (const p of (def.props || [])) {
        const type = p.type ?? p.ty;
        const variant = p.variant ?? p.v ?? 'square';
        const scale = p.scale ?? p.s ?? 1.0;

        if (type === 'pillar') {
          let pillarMesh;
          const PH = 4.8;

          const pTexObj = getTexture(p.customTex ?? p.tx);
          let pillarMat = mat.pillar;
          if (pTexObj) {
            const ptClone = pTexObj.clone();
            ptClone.wrapS = ptClone.wrapT = THREE.RepeatWrapping;
            ptClone.repeat.set(p.texRepeatX ?? p.rxp ?? 1, p.texRepeatY ?? p.ryp ?? 1);
            ptClone.needsUpdate = true;
            pillarMat = new THREE.MeshStandardMaterial({
              map: ptClone,
              color: 0xffffff,
              roughness: 0.7,
              side: THREE.DoubleSide
            });
          }

          if (variant === 'round') {
            const geo = new THREE.CylinderGeometry(0.5, 0.5, PH, 16);
            pillarMesh = new THREE.Mesh(geo, pillarMat);
            pillarMesh.position.set(p.x, (p.y || 0) + PH / 2, p.z);
          } else if (variant === 'thin') {
            const geo = new THREE.BoxGeometry(0.4, PH, 0.4);
            pillarMesh = new THREE.Mesh(geo, pillarMat);
            pillarMesh.position.set(p.x, (p.y || 0) + PH / 2, p.z);
          } else if (variant === 'ornate') {
            pillarMesh = new THREE.Group();
            const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.0), pillarMat);
            base.position.y = 0.3;
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.8, 12), pillarMat);
            body.position.y = 2.4;
            const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), pillarMat);
            top.position.y = 4.6;
            pillarMesh.add(base, body, top);
            pillarMesh.position.set(p.x, (p.y || 0), p.z);
          } else {
            // Square Default
            const geo = new THREE.BoxGeometry(0.8, PH, 0.8);
            pillarMesh = new THREE.Mesh(geo, pillarMat);
            pillarMesh.position.set(p.x, (p.y || 0) + PH / 2, p.z);
          }

          pillarMesh.scale.setScalar(scale);
          pillarMesh.traverse(c => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
              if (c.material) {
                const mats = Array.isArray(c.material) ? c.material : [c.material];
                mats.forEach(mat => { if (mat) mat.side = THREE.DoubleSide; });
              }
            }
          });
          mazeGroup.add(pillarMesh);
        }
      }
    }

    const merge = (geos) => THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeGeometries(geos) : geos[0];

    const shadowEnabled = (window.Settings && Settings.get('shadows') !== false);

    if (!isStatic && wallGeos.length) {
      const wallMesh = new THREE.Mesh(merge(wallGeos), mat.wall);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      mazeGroup.add(wallMesh);
    }
    if (!isStatic && pillarGeos.length) {
      const pillarMesh = new THREE.Mesh(merge(pillarGeos), mat.pillar);
      pillarMesh.castShadow = true;
      pillarMesh.receiveShadow = true;
      mazeGroup.add(pillarMesh);
    }

    // 4. Overlay Professional Vines & Twines on Walls (Realistic Clustering & Scaling)
    if (!isStatic) {

    const currentLvl = (typeof LevelManager !== 'undefined' && LevelManager.getCurrentIndex) ? LevelManager.getCurrentIndex() : 1;
    const activePlantDefs = (currentLvl === 1)
      ? wallPlantDefinitions.filter(def => def.type === 'vines')
      : wallPlantDefinitions;

    if (activePlantDefs.length > 0 && grid && grid.length > 0) {
      const wallCount = Math.min(220, rows * cols * 4);

      // Create InstancedMeshes for every merged part of every active plant type
      const renderGroups = activePlantDefs.map(def => {
        return {
          type: def.type,
          originalSize: def.originalSize,
          instances: def.parts.map(p => {
            const im = new THREE.InstancedMesh(p.geometry, p.material, wallCount);

            // Professional Shadows: Wall plants (vines/twine) now cast shadows for realism
            im.castShadow = shadowEnabled;
            im.receiveShadow = shadowEnabled;
            im.matrixAutoUpdate = false;

            mazeGroup.add(im);
            return { mesh: im, tIdx: 0 };
          })
        };
      });

      const dummy = new THREE.Object3D();

      const addPlantProfessional = (x, z, rotY, offsetZ = 0, density = 0.5) => {
        // Clustering: Use noise-like patterns for organic growth patches
        const cluster = Math.sin(x * 0.4) * Math.cos(z * 0.4) + Math.sin(x * 0.25 + z * 0.7) * 0.35;
        if (Math.random() > (density + cluster * 0.25)) return;

        // Choose plant type (vines or twine) with patch variety
        const typeIdx = (Math.abs(Math.floor(x * 0.25 + z * 0.25)) % renderGroups.length);
        const group = renderGroups[typeIdx];
        if (!group || !group.instances) return;

        // Proportional scale matching wall height
        const origHeight = (group.originalSize && group.originalSize.y > 0.1) ? group.originalSize.y : 2.0;
        const targetHeight = (H * 0.45) + Math.random() * (H * 0.45); // 2.0m to 4.0m
        const scaleFactor = targetHeight / origHeight;

        const scaleX = scaleFactor * (0.85 + Math.random() * 0.3);
        const scaleY = scaleFactor * (0.9 + Math.random() * 0.2);
        const scaleZ = scaleFactor * (0.85 + Math.random() * 0.3);

        const ox = Math.sin(rotY) * offsetZ;
        const oz = Math.cos(rotY) * offsetZ;

        // Natural height variation (some climbing high, some grounded)
        const isHanging = Math.random() > 0.4;
        const randomY = isHanging
          ? (H - (targetHeight * 0.5) - Math.random() * 0.4)
          : (targetHeight * 0.5 + 0.1 + Math.random() * 0.6);

        dummy.position.set(x + ox, randomY, z + oz);
        dummy.rotation.y = rotY + (Math.random() - 0.5) * 0.2;
        dummy.rotation.x = (Math.random() - 0.5) * 0.06;
        dummy.rotation.z = (Math.random() - 0.5) * 0.06;

        dummy.scale.set(scaleX, scaleY, scaleZ);
        dummy.updateMatrix();

        group.instances.forEach(inst => {
          if (inst.tIdx < wallCount) {
            inst.mesh.setMatrixAt(inst.tIdx++, dummy.matrix);
          }
        });
      };

      // Distance from wall center to ensure sticking flush
      const wallOffset = T / 2 + 0.02;
      const pOff = PW / 2 + 0.02;

      // 1. Pillars (Selective Growth on corners)
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= cols; c++) {
          const px = c * C, pz = r * C;

          // Only ~35% of pillars will have plants to prevent overcrowding
          if (Math.random() > 0.35) continue;

          // Pick 1-2 random internal faces
          const faces = [];
          if (r > 0) faces.push({ oz: -pOff, rot: Math.PI });    // North face
          if (r < rows) faces.push({ oz: pOff, rot: 0 });       // South face
          if (c > 0) faces.push({ ox: -pOff, rot: -Math.PI / 2 }); // West face
          if (c < cols) faces.push({ ox: pOff, rot: Math.PI / 2 }); // East face

          // Shuffle and pick 1 or 2
          for (let i = faces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [faces[i], faces[j]] = [faces[j], faces[i]];
          }

          const count = 1 + (Math.random() > 0.7 ? 1 : 0);
          for (let i = 0; i < Math.min(count, faces.length); i++) {
            const f = faces[i];
            addPlantProfessional(px + (f.ox || 0), pz + (f.oz || 0), f.rot, 0, 0.6);
          }
        }
      }

      // 2. Walls (Clean internal segments)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * C, z = r * C, cell = grid[r][c];

          // Reduced segments for a cleaner look
          const segments = 2;
          for (let i = 0; i < segments; i++) {
            const wallPos = (i + 0.3 + Math.random() * 0.4) * (C / segments);

            if (!(cell & MazeGenerator.N)) {
              addPlantProfessional(x + wallPos, z + wallOffset, 0, 0, 0.4);
              if (r > 0) addPlantProfessional(x + wallPos, z - wallOffset, Math.PI, 0, 0.3);
            }
            if (!(cell & MazeGenerator.W)) {
              addPlantProfessional(x + wallOffset, z + wallPos, Math.PI / 2, 0, 0.4);
              if (c > 0) addPlantProfessional(x - wallOffset, z + wallPos, -Math.PI / 2, 0, 0.3);
            }
            // Southern Boundary (Internal only)
            if (r === rows - 1 && !(cell & MazeGenerator.S)) {
              addPlantProfessional(x + wallPos, z + C - wallOffset, Math.PI, 0, 0.4);
            }
            // Eastern Boundary (Internal only)
            if (c === cols - 1 && !(cell & MazeGenerator.E)) {
              addPlantProfessional(x + C - wallOffset, z + wallPos, -Math.PI / 2, 0, 0.4);
            }
          }
        }
      }

      renderGroups.forEach(g => {
        g.instances.forEach(inst => {
          inst.mesh.count = inst.tIdx;
          inst.mesh.instanceMatrix.needsUpdate = true;
        });
      });
    }
    }

    if (def && def.isStatic) {
      if (def.exit) {
        PropsManager.placeExitDoorWorld(mazeGroup, def.exit.x, 0, def.exit.z, def.exit.rot || 0);
      }
      // Add torches if defined in static level
      if (def.torches) {
        def.torches.forEach(t => {
          PropsManager.placeWallTorch(mazeGroup, t.x, t.y || 2.2, t.z, t.rot || 0);
        });
      }
      // Add dynamic lights if defined in static level
      if (def.lights) {
        def.lights.forEach(l => {
          if (typeof LightSystem !== 'undefined') {
            const light = LightSystem.create(l.ty || l.type, {
              color: l.c || l.color,
              intensity: l.in || l.intensity,
              distance: l.d || l.distance,
              flickerSpeed: l.fs || l.flickerSpeed,
              jitter: l.ja || l.jitterAmount,
              angle: l.a || l.angle,
              penumbra: l.p || l.penumbra,
              isStatic: !!(l.st || l.isStatic)
            });
            light.position.set(l.x, l.y, l.z);
            mazeGroup.add(light);
          }
        });
      }
    } else {
      const { exit } = MazeGenerator.getStartExit(cols, rows, mazeData.levelDef);
      PropsManager.placeExitDoor(mazeGroup, exit.col, exit.row, theme);

      // Procedural Torch Placement
      _addWallTorches(grid, cols, rows);
    }

    SceneManager.add(mazeGroup);
    SceneManager.toggleVastTerrain(false);
    // _addMazeLights is disabled for pure atmospheric dark night & moonlight
    [...wallGeos, ...pillarGeos].forEach(g => g.dispose());

    // FINAL GLOBAL FORCE: Optimize visibility for performance
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    mazeGroup.traverse(node => {
      if (node.isMesh && node.material) {
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach(m => {
          if (m) {
            // Mobile Optimization: FrontSide is much faster than DoubleSide
            // We only keep DoubleSide for things that really need it (like plants/grass)
            const needsDouble = node.name.includes('Grass') || node.name.includes('Plant') || node.name.includes('Vines');
            m.side = (isMobile && !needsDouble) ? THREE.FrontSide : THREE.DoubleSide;
            m.shadowSide = THREE.FrontSide;
            m.needsUpdate = true;
          }
        });
      }
    });

    return mazeGroup;
  }

  function _addMazeLights(grid, cols, rows) {
    // Kept for future themes if needed
  }

  function setGrass(enabled) {
    if (!mazeGroup) return;
    mazeGroup.traverse(node => {
      if (node.name === 'InstancedGrass') {
        node.visible = enabled;
      }
    });
  }

  function _addWallTorches(grid, cols, rows) {
    if (!grid || grid.length === 0) return;
    const C = CELL_SIZE, T = WALL_T, H = WALL_H;
    const torchY = H * 0.6;
    const offset = T / 2 + 0.05;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Only place torches occasionally to save performance (15% chance per cell)
        if (Math.random() > 0.15) continue;

        const x = c * C, z = r * C, cell = grid[r][c];

        // Try to find a wall to place the torch on
        if (!(cell & MazeGenerator.N)) {
          PropsManager.placeWallTorch(mazeGroup, x + C/2, torchY, z + offset, 0);
        } else if (!(cell & MazeGenerator.W)) {
          PropsManager.placeWallTorch(mazeGroup, x + offset, torchY, z + C/2, Math.PI/2);
        } else if (!(cell & MazeGenerator.S)) {
          PropsManager.placeWallTorch(mazeGroup, x + C/2, torchY, z + C - offset, Math.PI);
        } else if (!(cell & MazeGenerator.E)) {
          PropsManager.placeWallTorch(mazeGroup, x + C - offset, torchY, z + C/2, -Math.PI/2);
        }
      }
    }
  }

  function cellToWorld(col, row) { return new THREE.Vector3(col * CELL_SIZE + CELL_SIZE / 2, 0, row * CELL_SIZE + CELL_SIZE / 2); }
  function worldToCell(x, z) { return { col: Math.floor(x / CELL_SIZE), row: Math.floor(z / CELL_SIZE) }; }
  function dispose() {
    if (mazeGroup) {
      SceneManager.remove(mazeGroup);
      mazeGroup = null;
    }
    if (typeof LightSystem !== 'undefined') {
      LightSystem.clear();
    }
  }

  return { build, cellToWorld, worldToCell, dispose, loadPBRTextures, setGrass, CELL_SIZE, WALL_H };
})();
