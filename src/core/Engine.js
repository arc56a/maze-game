/**
 * Engine.js — Three.js Core Engine
 * Initializes renderer, scene, clock, RAF loop
 */

const Engine = (() => {
  // ─── State ───────────────────────────────────────────────
  let renderer, scene, clock;
  let animationId = null;
  let running     = false;
  let updateCallbacks = [];
  let _shadowMapNeedsUpdate = true;

  // ─── Init ────────────────────────────────────────────────
  function init() {
    const canvas = document.getElementById('game-canvas');

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // Turned off by default for mobile performance
      powerPreference: 'high-performance',
      precision: 'mediump' // Standard for mobile to save GPU power
    });

    // Smart DPR Capping: 1.5 is a sweet spot for mobile clarity vs heat.
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const dpr = isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio || 1, 2.0);

    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Re-enable shadows for "details"
    renderer.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2030);
    scene.fog = new THREE.FogExp2(0x8aadcc, 0.008);

    // Clock
    clock = new THREE.Clock();

    // Resize
    window.addEventListener('resize', onResize);

    console.log('[Engine] Initialized ✓ (Native HD DPR:', dpr, ')');
  }

  // ─── Resize ──────────────────────────────────────────────
  function onResize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Camera resize handled by CameraController
    if (window.CameraController) CameraController.onResize();
  }

  // ─── Loop ────────────────────────────────────────────────
  function start() {
    if (running) return;
    running = true;
    clock.start();
    loop();
    console.log('[Engine] Loop started ✓');
  }

  function stop() {
    running = false;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
  }

  function loop() {
    animationId = requestAnimationFrame(loop);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // Cache player position for other systems to access
    if (window.PlayerController) {
      Engine.lastPlayerPos = PlayerController.getPosition();
    }

    // Run all registered update callbacks
    for (const cb of updateCallbacks) cb(delta, elapsed);

    // Dynamic Shadow Management (Robust Global Toggle)
    const shadowsEnabled = (window.Settings && typeof Settings.get === 'function') ? (Settings.get('shadows') !== false) : true;
    if (renderer.shadowMap.enabled !== shadowsEnabled) {
      setShadows(shadowsEnabled);
    }

    // Render
    const cam = CameraController.getActive();
    if (cam) {
      renderer.render(scene, cam);
    }
  }

  // ─── Quality ─────────────────────────────────────────────
  function setQuality(level) {
    if (!renderer) return;

    const dpr = window.devicePixelRatio || 1;
    const isAA = (window.Settings && Settings.get('antialiasing') !== false);

    // Pixel Ratios: Native crisp Retina/HD on all mobile screens
    const pixelRatios = {
      low: Math.min(dpr, 1.25),
      medium: Math.min(dpr, 2.0),
      high: Math.min(dpr, 2.5)
    };

    const targetRatio = pixelRatios[level] || Math.min(dpr, 2.0);
    renderer.setPixelRatio(targetRatio);

    // 2. Shadow Quality (type)
    if (level === 'low') {
      renderer.shadowMap.type = THREE.BasicShadowMap;
    } else if (level === 'medium') {
      renderer.shadowMap.type = THREE.PCFShadowMap;
    } else {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // 3. Size update to apply pixel ratio changes
    renderer.setSize(window.innerWidth, window.innerHeight);

    console.log(`[Engine] Quality: ${level} (DPR: ${targetRatio.toFixed(2)}, AA: ${isAA})`);
  }

  function setShadows(enabled) {
    if (!renderer || !scene) return;

    // 1. Global Renderer Toggle
    renderer.shadowMap.enabled = !!enabled;

    // 2. Scene Traversal — update meshes accurately
    const skyMeshNames = ['SkyDome', 'ProceduralSky', 'StarField', 'SunSprite', 'SunAuraSprite', 'MoonSprite', 'MoonAuraSprite', 'InstancedGrass'];

    scene.traverse(node => {
      // Mesh Shadow Handling
      if (node.isMesh && !skyMeshNames.includes(node.name)) {
        if (node.name === 'VastTerrain') {
          node.castShadow    = false;
          node.receiveShadow = !!enabled;
        } else {
          node.castShadow    = !!enabled;
          node.receiveShadow = !!enabled;
        }
        // Force material re-compile to apply/strip shadow shaders
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(m => { if (m) m.needsUpdate = true; });
        }
      }

      // Light Shadow Handling (Disable casting from all lights)
      if (node.isLight) {
        node.castShadow = !!enabled;
      }
    });

    console.log(`[Engine] Shadow system ${enabled ? 'ENABLED' : 'DISABLED'} across scene.`);
  }

  // ─── GPU Warm up ──────────────────────────────────────────
  // Reverted to a safe, single-pass compilation for stability
  async function warmUp(camera) {
    if (!renderer || !scene || !camera) return;
    renderer.compile(scene, camera);
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        renderer.render(scene, camera);
        resolve();
      });
    });
  }

  // ─── Helpers ─────────────────────────────────────────────
  function onUpdate(cb) { updateCallbacks.push(cb); }
  function offUpdate(cb) { updateCallbacks = updateCallbacks.filter(f => f !== cb); }
  function clearUpdates() { updateCallbacks = []; }

  function getRenderer() { return renderer; }
  function getScene()    { return scene; }
  function getClock()    { return clock; }

  return {
    init, start, stop, onUpdate, offUpdate, clearUpdates, getRenderer, getScene, getClock, setQuality, setShadows, warmUp,
    get shadowMapNeedsUpdate() { return _shadowMapNeedsUpdate; },
    set shadowMapNeedsUpdate(v) { _shadowMapNeedsUpdate = v; }
  };
})();
