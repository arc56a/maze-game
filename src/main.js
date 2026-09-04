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
  // Core
  'src/core/Engine.js',
  'src/core/AssetLoader.js',
  'src/core/SceneManager.js',
  'src/core/LightSystem.js',
  'src/core/atmosphere/AtmosphereData.js',
  'src/core/atmosphere/SkyVisuals.js',
  'src/core/atmosphere/LensFlareManager.js',
  'src/core/AtmosphereSystem.js',
  'src/core/InputManager.js',
  'src/core/AudioManager.js',
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
  'مراحل/Level1.js',
  // UI
  'ui/scripts/Settings.js',
  'ui/scripts/HUD.js',
  'ui/scripts/Minimap.js',
  'ui/scripts/Joystick.js',
  'ui/scripts/UI.js',
  'ui/scripts/ProfileUI.js',
  // Telegram
  'src/telegram/TelegramAPI.js',
  // Bootstrap
  'src/Game.js',
];

for (const src of scripts) {
  try {
    await loadScript(src);
  } catch(e) {
    console.error('[main] Failed to load:', src, e);
  }
}
