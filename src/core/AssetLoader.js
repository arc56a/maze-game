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

    const p = new Promise((resolve, reject) => {
      _getGLTF().load(
        url,
        gltf => {
          cache[url] = finalizeAsset(gltf);
          delete pendingPromises[url];
          jobProgress[url] = 1;
          // Note: total might not be known until finished if not provided by server
          if (jobBytes[url].total === 0) jobBytes[url].total = jobBytes[url].loaded;
          _tick();
          resolve(cache[url]);
        },
        xhr  => {
          if (xhr.total > 0) {
            jobProgress[url] = xhr.loaded / xhr.total;
            jobBytes[url].loaded = xhr.loaded;
            jobBytes[url].total = xhr.total;
            _tick();
          } else {
            // Fallback if total is unknown
            jobBytes[url].loaded = xhr.loaded;
          }
        },
        err  => {
          const logUrl = (typeof url === 'string' && url.startsWith('data:')) ? url.substring(0, 32) + '...' : url;
          console.error('[AssetLoader] GLTF error:', logUrl, err);
          delete pendingPromises[url];
          delete jobProgress[url];
          delete jobBytes[url];
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
    jobProgress[url] = 0;
    jobBytes[url] = { loaded: 0, total: 0 };

    const p = new Promise((resolve, reject) => {
      textureLoader.load(
        url,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          // Performance & Beauty: Anisotropy makes textures much sharper at glancing angles
          if (renderer) {
            tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          }
          cache[url] = tex;
          delete pendingPromises[url];
          jobProgress[url] = 1;
          if (jobBytes[url].total === 0) jobBytes[url].total = jobBytes[url].loaded;
          _tick();
          resolve(tex);
        },
        xhr => {
          if (xhr && xhr.total > 0) {
            jobProgress[url] = xhr.loaded / xhr.total;
            jobBytes[url].loaded = xhr.loaded;
            jobBytes[url].total = xhr.total;
            _tick();
          } else if (xhr) {
            jobBytes[url].loaded = xhr.loaded;
          }
        },
        err => {
          const logUrl = (typeof url === 'string' && url.startsWith('data:')) ? url.substring(0, 32) + '...' : url;
          console.error('[AssetLoader] Texture error:', logUrl, err);
          delete pendingPromises[url];
          delete jobProgress[url];
          delete jobBytes[url];
          _tick();
          reject(err);
        }
      );
    });
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

    const p = new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          jobProgress[url] = event.loaded / event.total;
          jobBytes[url].loaded = event.loaded;
          jobBytes[url].total = event.total;
          _tick();
        } else {
          jobBytes[url].loaded = event.loaded;
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          cache[url] = xhr.response;
          jobProgress[url] = 1;
          jobBytes[url].loaded = xhr.response.byteLength;
          jobBytes[url].total = xhr.response.byteLength;
          delete pendingPromises[url];
          _tick();
          resolve(xhr.response);
        } else {
          reject(new Error(`Audio load failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        delete pendingPromises[url];
        delete jobProgress[url];
        _tick();
        reject(new Error('Audio network error'));
      };

      xhr.send();
    });

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
