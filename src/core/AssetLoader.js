/**
 * AssetLoader.js
 * Central asset loading: GLTF, textures, audio
 * Tracks progress for the loading screen
 */

const AssetLoader = (() => {
  const globalCache = {};
  const levelCache  = {};
  let   totalJobs = 0;
  let   doneJobs  = 0;
  let   onProgressCB = null;

  const gltfLoader    = null;
  const textureLoader = new THREE.TextureLoader();

  function _getGLTF() {
    return window._gltfLoader || (window._gltfLoader = new THREE.GLTFLoader());
  }

  // ─── Load GLTF / GLB ─────────────────────────────────────
  function _normalizeShadowState(root) {
    if (!root) return;
    root.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m) {
              m.side = THREE.DoubleSide;
              m.shadowSide = THREE.DoubleSide;
              m.needsUpdate = true;
            }
          });
        }
      }
      if (obj.isLight) {
        obj.castShadow = true;
      }
    });
  }

  function finalizeAsset(asset) {
    if (!asset) return asset;
    if (asset.scene) _normalizeShadowState(asset.scene);
    if (Array.isArray(asset.scenes)) asset.scenes.forEach(scene => _normalizeShadowState(scene));
    return asset;
  }

  const pendingPromises = {};

  function loadGLTF(url, isGlobal = false) {
    const cache = isGlobal ? globalCache : levelCache;
    if (globalCache[url]) return Promise.resolve(globalCache[url]);
    if (levelCache[url])  return Promise.resolve(levelCache[url]);
    if (pendingPromises[url]) return pendingPromises[url];

    totalJobs++;
    const p = new Promise((resolve, reject) => {
      _getGLTF().load(
        url,
        gltf => {
          cache[url] = finalizeAsset(gltf);
          delete pendingPromises[url];
          _tick();
          resolve(cache[url]);
        },
        xhr  => { /* progress */ },
        err  => {
          const logUrl = (typeof url === 'string' && url.startsWith('data:')) ? url.substring(0, 32) + '...' : url;
          console.error('[AssetLoader] GLTF error:', logUrl, err);
          delete pendingPromises[url];
          _tick();
          reject(err);
        }
      );
    });
    pendingPromises[url] = p;
    return p;
  }

  // ─── Load Texture ─────────────────────────────────────────
  function loadTexture(url, isGlobal = false) {
    const cache = isGlobal ? globalCache : levelCache;
    if (globalCache[url]) return Promise.resolve(globalCache[url]);
    if (levelCache[url])  return Promise.resolve(levelCache[url]);
    if (pendingPromises[url]) return pendingPromises[url];

    totalJobs++;
    const p = new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          cache[url] = tex;
          delete pendingPromises[url];
          _tick();
          resolve(tex);
        },
        undefined,
        err => {
          const logUrl = (typeof url === 'string' && url.startsWith('data:')) ? url.substring(0, 32) + '...' : url;
          console.error('[AssetLoader] Texture error:', logUrl, err);
          delete pendingPromises[url];
          _tick();
          reject(err);
        }
      );
    });
    pendingPromises[url] = p;
    return p;
  }

  // ─── Load Multiple ────────────────────────────────────────
  function loadAll(assets, isGlobal = false) {
    const promises = assets.map(a => {
      if (a.type === 'gltf')    return loadGLTF(a.url, isGlobal).then(r => [a.key, r]);
      if (a.type === 'texture') return loadTexture(a.url, isGlobal).then(r => [a.key, r]);
      return Promise.resolve([a.key, null]);
    });
    return Promise.all(promises).then(results => Object.fromEntries(results));
  }

  // ─── Progress ─────────────────────────────────────────────
  function _tick() {
    doneJobs++;
    const pct = totalJobs > 0 ? (doneJobs / totalJobs) * 100 : 100;
    if (onProgressCB) onProgressCB(pct);
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = pct + '%';
  }

  function onProgress(cb) { onProgressCB = cb; }

  function reset() {
    totalJobs = 0;
    doneJobs  = 0;
    clearLevelAssets();
  }

  function clearLevelAssets() {
    console.log('[AssetLoader] Clearing level assets...');
    for (const url in levelCache) {
      const asset = levelCache[url];
      _disposeDeep(asset);
      delete levelCache[url];
    }
  }

  function _disposeDeep(obj) {
    if (!obj) return;
    if (obj.scene) { // GLTF
      obj.scene.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
          else node.material.dispose();
        }
      });
    } else if (obj.dispose) { // Texture or Geometry
      obj.dispose();
    }
  }

  function get(url) { return globalCache[url] || levelCache[url]; }
  function getAll() { return { ...globalCache, ...levelCache }; }

  return { loadGLTF, loadTexture, loadAll, onProgress, reset, get, getAll, clearLevelAssets };
})();
