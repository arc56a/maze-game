(function () {
  if (typeof window === 'undefined') return;

  const BASE_DIRS = [
    'levels/'
  ];

  const AUTO_DIRS = [...new Set([
    ...BASE_DIRS,
    ...(Array.isArray(window.__LEVEL_DIRS__) ? window.__LEVEL_DIRS__ : []),
    ...(Array.isArray(window.__LEVEL_FILES__) ? window.__LEVEL_FILES__.map(f => {
      const dir = f.split('/').slice(0, -1).join('/');
      return dir ? dir + '/' : '';
    }) : [])
  ])].filter(Boolean);

  const IGNORED = new Set([
    'LevelManager.js',
    'AutoLevelLoader.js',
    'README.md',
    'README'
  ]);

  function normalizeUrl(raw) {
    let value = raw || '';
    if (!value) return '';
    value = value.replace(/\\/g, '/');
    value = value.replace(/^\.\//, '');
    if (value.startsWith('/')) value = value.substring(1);
    return value;
  }

  function extractJsFiles(html) {
    if (!html) return [];
    const matches = [...html.matchAll(/href=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)];
    const files = matches
      .map(m => normalizeUrl(m[1]))
      .filter(Boolean)
      .filter(path => !path.includes('://'));
    return [...new Set(files)];
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-level-src="${src}"]`);
      if (existing) {
        resolve(existing);
        return;
      }

      const s = document.createElement('script');
      s.src = src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now();
      s.setAttribute('data-level-src', src);
      s.onload = () => resolve(s);
      s.onerror = () => reject(new Error('Failed to load level script: ' + src));
      document.head.appendChild(s);
    });
  }

  async function scanLevelDir(dirUrl) {
    try {
      const response = await fetch(dirUrl + '?v=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return [];
      const html = await response.text();
      return extractJsFiles(html);
    } catch (e) {
      return [];
    }
  }

  const DEFAULT_LEVEL_FILES = [
    'levels/Level1.js'
  ];

  async function scanAndRegister() {
    const found = new Set();
    const dirs = [...new Set(AUTO_DIRS)];

    // 1. Scan directory if server supports directory index
    for (const dir of dirs) {
      const files = await scanLevelDir(dir);
      for (const file of files) {
        const name = file.split('/').pop().split('?')[0].split('#')[0];
        if (!file.endsWith('.js')) continue;
        if (IGNORED.has(name)) continue;
        if (name === 'LevelManager.js' || name === 'AutoLevelLoader.js') continue;
        if (!file.startsWith('levels/')) continue;
        found.add(file);
      }
    }

    // 2. Add custom specified files
    const customFiles = Array.isArray(window.__LEVEL_FILES__) ? window.__LEVEL_FILES__.map(normalizeUrl) : [];
    for (const file of customFiles) {
      if (!file.endsWith('.js')) continue;
      const name = file.split('/').pop().split('?')[0].split('#')[0];
      if (!IGNORED.has(name) && file.startsWith('levels/')) found.add(file);
    }

    // 3. Always include default known levels if none or as baseline
    for (const defFile of DEFAULT_LEVEL_FILES) {
      found.add(defFile);
    }

    for (const file of [...found]) {
      try {
        await loadScript(file);
      } catch (e) {
        console.warn('[LevelAutoLoader] Could not load', file, e);
      }
    }

    return [...found];
  }

  window.LevelAutoLoader = { scanAndRegister, loadScript, DEFAULT_LEVEL_FILES };
})();
