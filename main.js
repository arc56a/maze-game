/**
 * main.js — ESM entry point
 * Imports all modules and wires the game
 */

import * as THREE from 'three';
import { GLTFLoader }          from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls }       from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoundedBoxGeometry }  from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils      from 'three/addons/utils/SkeletonUtils.js';

// ─── Make THREE global with addons attached ───────────────
window.THREE = Object.assign({}, THREE, {
  GLTFLoader,
  OrbitControls,
  PointerLockControls,
  RoundedBoxGeometry,
  BufferGeometryUtils,
  SkeletonUtils,
});
window.GLTFLoader = GLTFLoader;
window.OrbitControls = OrbitControls;
window.PointerLockControls = PointerLockControls;
window.BufferGeometryUtils = BufferGeometryUtils;
window.SkeletonUtils = SkeletonUtils;

// ─── Dynamic imports in dependency order ──────────────────
// Core
const { default: _AudioManager }  = await import('./core/AudioManager.js?t=' + Date.now()).catch(()=>({default:null}));
const { default: _Engine }        = await import('./core/Engine.js?t='        + Date.now()).catch(()=>({default:null}));

// ─── Simple sequential loader ─────────────────────────────
async function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src   = src + '?v=' + Date.now();
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// Load all game scripts in correct order
const scripts = [
  // Core Systems
  'src/core/Engine.js',
  'src/core/AssetLoader.js',
  'src/core/AudioManager.js',
  'ui/scripts/UI.js',

  // Game Logic
  'src/core/SceneManager.js',
  'src/core/LightSystem.js',
  'src/core/atmosphere/AtmosphereData.js',
  'src/core/atmosphere/SkyVisuals.js',
  'src/core/atmosphere/LensFlareManager.js',
  'src/core/AtmosphereSystem.js',
  'src/core/InputManager.js',
  'src/core/WeatherSystem.js',
  // Maze
  'src/maze/MazeGenerator.js',
  'src/maze/PropsManager.js',
  'src/maze/MazeRenderer.js',
  'src/maze/MazeCollision.js',
  // Camera
  'src/camera/CameraController.js',
  'src/camera/FirstPersonCamera.js',
  'src/camera/ThirdPersonCamera.js',
  'src/camera/DevCamera.js',
  // Characters
  'characters/CharacterManager.js',
  'characters/VitalSystem.js',
  'characters/PlayerController.js',
  // Levels
  'levels/LevelManager.js',
  'levels/AutoLevelLoader.js',
  'levels/Level1.js',
  // UI
  'ui/scripts/Settings.js',
  'ui/scripts/HUD.js',
  'ui/scripts/Minimap.js',
  'ui/scripts/Joystick.js',
  'ui/scripts/ProfileUI.js',
  // Telegram
  'src/telegram/TelegramAPI.js',
  // Bootstrap
  'src/Game.js',
];

// Heavy Global Assets to ensure "Real Data" progress
const globalAssets = [
  { type: 'texture', url: 'assets/ui/menu_bg.png', key: 'menu_bg' },
  { type: 'texture', url: 'assets/ui/hud_widget_bg.png', key: 'hud_widget_bg' },
  { type: 'audio',   url: 'assets/sounds/menu_theme.mp3', key: 'menu_theme' },
  { type: 'texture', url: 'assets/ui/icons/circular icon for downloading.png', key: 'loading_icon' },
  { type: 'texture', url: 'assets/ui/icons/btn_play.png', key: 'btn_play' }
];

async function startLoading() {
  const totalSteps = scripts.length + globalAssets.length;
  let currentStep = 0;

  // 1. Load Essential Loader Scripts first
  const coreCount = 4; // Engine, AssetLoader, AudioManager, UI
  for (let i = 0; i < coreCount; i++) {
    await loadScript(scripts[i]);
    currentStep++;
    updateLoadingUI((currentStep / totalSteps) * 100, `جاري تشغيل النظام... (${currentStep}/${totalSteps})`);
  }

  // 2. Now that AssetLoader is ready, load Heavy Assets with real progress
  if (window.AssetLoader) {
    AssetLoader.onProgress((assetPct, bytes) => {
      const basePct = (coreCount / totalSteps) * 100;
      const assetContribution = (globalAssets.length / totalSteps) * assetPct;

      let sizeInfo = "";
      if (bytes && bytes.total > 0) {
        const loadedMB = (bytes.loaded / 1024 / 1024).toFixed(2);
        const totalMB = (bytes.total / 1024 / 1024).toFixed(2);
        sizeInfo = `${loadedMB} MB / ${totalMB} MB`;
      }

      updateLoadingUI(basePct + assetContribution, `جاري تحميل موارد اللعبة... ${Math.round(assetPct)}%`, sizeInfo);
    });

    await AssetLoader.loadAll(globalAssets, true);
  }

  // 3. Load remaining scripts
  currentStep = coreCount + globalAssets.length;
  for (let i = coreCount; i < scripts.length; i++) {
    await loadScript(scripts[i]);
    currentStep++;
    const pct = (currentStep / totalSteps) * 100;
    updateLoadingUI(pct, `جاري تهيئة المكونات... (${i + 1}/${scripts.length})`);
  }

  // Finalize
  updateLoadingUI(100, 'جاهز للمغامرة!');

  if (window.UI) {
    setTimeout(() => {
      if (UI.getCurrent() === 'loading') {
         UI.showScreen('menu');
      }
    }, 800);
  }
}

function updateLoadingUI(pct, text, sizeInfo = "") {
  const bar = document.getElementById('loading-bar');
  const pEl = document.getElementById('loading-percentage');
  const tEl = document.getElementById('loading-text');
  const sEl = document.getElementById('loading-size');

  if (bar) bar.style.width = pct + '%';
  if (pEl) pEl.textContent = Math.round(pct) + '%';
  if (tEl) tEl.textContent = text;
  if (sEl) sEl.textContent = sizeInfo;
}

// Start the sequence
startLoading();

// Removed the old simple loop
/*
const totalScripts = scripts.length;
let loadedCount = 0;
...
*/
