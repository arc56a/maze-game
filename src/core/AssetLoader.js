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
  function _normalizeState(root) {
    if (!root) return;
    root.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m) {
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          }
        });
      }
    });
  }

  function finalizeAsset(asset) {
    if (!asset) return asset;
    if (asset.scene) _normalizeState(asset.scene);
    if (Array.isArray(asset.scenes)) asset.scenes.forEach(scene => _normalizeState(scene));
    return asset;
  }

  const pendingPromises = {};
  const jobProgress = {};
  const jobBytes = {}; // Tracks { loaded, total } for each URL

  function loadGLTF(url, isGlobal = false) {
    const cache = isGlobal ? globalCache : levelCache;
    if (globalCache[url]) return Promise.resolve(globalCache[url]);
    if (levelCache[url])  return Promise.resolve(levelCache[url]);
    if (pendingPromises[url]) return pendingPromises[url];

    totalJobs++;
    jobProgress[url] = 0;
    jobBytes[url] = { loaded: 0, total: 0 };

    const p = (async () => {
      try {
        // 1. Try Cache First
        if (window.CacheManager) {
          const cached = await CacheManager.getAsset(url);
          if (cached) {
            console.log(`[AssetLoader] Loaded from cache: ${url}`);
            const blobUrl = URL.createObjectURL(cached);
            const gltf = await new Promise((res, rej) => {
              _getGLTF().load(blobUrl, res, undefined, rej);
            });
            URL.revokeObjectURL(blobUrl);
            cache[url] = finalizeAsset(gltf);
            jobProgress[url] = 1;
            _tick();
            delete pendingPromises[url];
            return cache[url];
          }
        }

        // 2. Fetch and Save
        const response = await fetch(url);
        const blob = await response.blob();
        if (window.CacheManager) await CacheManager.saveAsset(url, blob);

        const blobUrl = URL.createObjectURL(blob);
        const gltf = await new Promise((res, rej) => {
          _getGLTF().load(blobUrl, res, undefined, rej);
        });
        URL.revokeObjectURL(blobUrl);

        cache[url] = finalizeAsset(gltf);
        jobProgress[url] = 1;
        _tick();
        delete pendingPromises[url];
        return cache[url];
      } catch (err) {
        console.error('[AssetLoader] GLTF error:', url, err);
        delete pendingPromises[url];
        _tick();
        throw err;
      }
    })();

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
    jobProgress[url] = 0;
    jobBytes[url] = { loaded: 0, total: 0 };

    const p = (async () => {
      try {
        // 1. Try Cache
        if (window.CacheManager) {
          const cached = await CacheManager.getAsset(url);
          if (cached) {
            const blobUrl = URL.createObjectURL(cached);
            const tex = await new Promise((res, rej) => {
              textureLoader.load(blobUrl, res, undefined, rej);
            });
            URL.revokeObjectURL(blobUrl);
            const renderer = window.Engine ? Engine.getRenderer() : null;
            if (renderer) tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
            cache[url] = tex;
            jobProgress[url] = 1;
            _tick();
            delete pendingPromises[url];
            return tex;
          }
        }

        // 2. Network
        const response = await fetch(url);
        const blob = await response.blob();
        if (window.CacheManager) await CacheManager.saveAsset(url, blob);

        const blobUrl = URL.createObjectURL(blob);
        const tex = await new Promise((res, rej) => {
          textureLoader.load(blobUrl, res, undefined, rej);
        });
        URL.revokeObjectURL(blobUrl);

        tex.colorSpace = THREE.SRGBColorSpace;
        const renderer = window.Engine ? Engine.getRenderer() : null;
        if (renderer) tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
        cache[url] = tex;
        jobProgress[url] = 1;
        _tick();
        delete pendingPromises[url];
        return tex;
      } catch (err) {
        console.error('[AssetLoader] Texture error:', url, err);
        delete pendingPromises[url];
        _tick();
        throw err;
      }
    })();

    pendingPromises[url] = p;
    return p;
  }

  // ─── Load Audio (Real Data Progress) ─────────────────────
  function loadAudio(url, isGlobal = false) {
    const cache = isGlobal ? globalCache : levelCache;
    if (globalCache[url]) return Promise.resolve(globalCache[url]);
    if (levelCache[url])  return Promise.resolve(levelCache[url]);
    if (pendingPromises[url]) return pendingPromises[url];

    totalJobs++;
    jobProgress[url] = 0;
    jobBytes[url] = { loaded: 0, total: 0 };

    const p = (async () => {
      try {
        if (window.CacheManager) {
          const cached = await CacheManager.getAsset(url);
          if (cached) {
            cache[url] = cached;
            jobProgress[url] = 1;
            _tick();
            delete pendingPromises[url];
            return cached;
          }
        }

        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        if (window.CacheManager) await CacheManager.saveAsset(url, buffer);

        cache[url] = buffer;
        jobProgress[url] = 1;
        _tick();
        delete pendingPromises[url];
        return buffer;
      } catch (err) {
        console.error('[AssetLoader] Audio error:', url, err);
        delete pendingPromises[url];
        _tick();
        throw err;
      }
    })();

    pendingPromises[url] = p;
    return p;
  }

  // ─── Load Multiple ────────────────────────────────────────
  function loadAll(assets, isGlobal = false) {
    const promises = assets.map(a => {
      if (a.type === 'gltf')    return loadGLTF(a.url, isGlobal).then(r => [a.key, r]);
      if (a.type === 'texture') return loadTexture(a.url, isGlobal).then(r => [a.key, r]);
      if (a.type === 'audio')   return loadAudio(a.url, isGlobal).then(r => [a.key, r]);
      return Promise.resolve([a.key, null]);
    });
    return Promise.all(promises).then(results => Object.fromEntries(results));
  }

  // ─── Progress ─────────────────────────────────────────────
  function _tick() {
    let sumPct = 0;
    let count = 0;
    let totalBytesLoaded = 0;
    let totalBytesExpected = 0;

    for (let key in jobProgress) {
      sumPct += jobProgress[key];
      count++;
    }

    for (let key in jobBytes) {
      totalBytesLoaded += jobBytes[key].loaded;
      totalBytesExpected += jobBytes[key].total;
    }

    const pct = count > 0 ? (sumPct / count) * 100 : (totalJobs > 0 ? (doneJobs / totalJobs) * 100 : 100);

    if (onProgressCB) {
      onProgressCB(pct, {
        loaded: totalBytesLoaded,
        total: totalBytesExpected
      });
    }

    // Update UI directly if possible, or let the caller do it
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = pct + '%';
    const pEl = document.getElementById('loading-percentage');
    if (pEl) pEl.textContent = Math.round(pct) + '%';
  }

  function onProgress(cb) { onProgressCB = cb; }

  function reset() {
    totalJobs = 0;
    doneJobs  = 0;
    for(let key in jobProgress) delete jobProgress[key];
    for(let key in jobBytes) delete jobBytes[key];
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

  return { loadGLTF, loadTexture, loadAudio, loadAll, onProgress, reset, get, getAll, clearLevelAssets };
})();
