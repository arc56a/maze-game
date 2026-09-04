/**
 * CharacterManager.js
 * Advanced character loader with auto-scaling and material recovery
 */

const CharacterManager = (() => {
  const registry = {};

  async function load(key, gltfPath) {
    if (registry[key]) return registry[key];
    console.log(`[CharacterManager] Loading "${key}" from ${gltfPath}...`);

    try {
      const gltf   = await AssetLoader.loadGLTF(gltfPath);
      const model  = gltf.scene;
      const mixer  = new THREE.AnimationMixer(model);
      const clips  = {};
      const parser = gltf.parser;

      // 1. Pre-load all textures
      const recoveredMaps = [];
      if (parser?.json?.textures) {
        for (let i = 0; i < parser.json.textures.length; i++) {
          try { recoveredMaps[i] = await parser.getDependency('texture', i); } catch (e) {}
        }
      }

      // 2. Load External Animations
      const externalAnims = [
        { name: 'walk', path: 'characters/animations/walk1.glb' },
        { name: 'run',  path: 'characters/animations/run1.glb' },
        { name: 'jump', path: 'characters/animations/Standard_jump.glb' },
        { name: 'jump_run', path: 'characters/animations/Jump_and_run.glb' },
        { name: 'jump_down', path: 'characters/animations/Jumping_Down.glb' }
      ];

      for (const anim of externalAnims) {
        try {
          const animGltf = await AssetLoader.loadGLTF(anim.path);
          if (animGltf.animations && animGltf.animations[0]) {
            const clip = animGltf.animations[0];
            const action = mixer.clipAction(clip);
            clips[anim.name] = action;
            console.log(`[CharacterManager] External animation "${anim.name}" loaded for ${key}`);
          }
        } catch (e) {
          console.warn(`[CharacterManager] Failed to load external animation "${anim.name}"`, e);
        }
      }

      // 3. Index internal animations with smart mapping
      if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach(clip => {
          const action = mixer.clipAction(clip);
          const name = clip.name.toLowerCase().replace(/.*\|/, '').trim();
          if (!clips[clip.name]) clips[clip.name] = action;
          if (!clips[name]) clips[name] = action;

          if (name.includes('idle')) clips['idle'] = action;
          if (name.includes('walk') && !clips['walk']) clips['walk'] = action;
          if (name.includes('run') && !clips['run'])  clips['run']  = action;
        });
      }

      // Fallback if no named clips
      if (!clips['idle'] && gltf.animations[0]) clips['idle'] = mixer.clipAction(gltf.animations[0]);
      if (!clips['walk'] && gltf.animations[1]) clips['walk'] = mixer.clipAction(gltf.animations[1]);
      if (!clips['run'] && gltf.animations[2])  clips['run']  = mixer.clipAction(gltf.animations[2]);

      // 3. Auto-Normalize Scale (Target height ~1.8m)
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);

      console.log(`[CharacterManager] Model raw size:`, size);

      if (size.y > 0) {
        const targetH = 1.8;
        const s = targetH / size.y;
        model.scale.set(s, s, s);
        console.log(`[CharacterManager] Normalized scale applied: ${s}`);
      }

      // 4. Material Enhancement
      model.traverse(node => {
        if (node.isMesh) {
          node.castShadow = node.receiveShadow = true;
          if (node.material) {
            const old = node.material;
            let tex = old.map;

            // Texture recovery for pbrSpecularGlossiness or broken links
            if (!tex && parser?.json?.materials) {
              const mDef = parser.json.materials.find(m => m.name === old.name);
              const sg = mDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
              if (sg?.diffuseTexture) tex = recoveredMaps[sg.diffuseTexture.index];
              if (!tex && mDef?.pbrMetallicRoughness?.baseColorTexture) tex = recoveredMaps[mDef.pbrMetallicRoughness.baseColorTexture.index];
            }

            if (!tex) tex = recoveredMaps.find(t => t);

            node.material = new THREE.MeshStandardMaterial({
              map: tex || null,
              color: new THREE.Color(0xffffff), // Raw texture colors
              roughness: old.roughness !== undefined ? old.roughness : 0.8,
              metalness: old.metalness !== undefined ? old.metalness : 0.1,
              transparent: !!old.transparent,
              alphaTest: 0.5,
              side: THREE.DoubleSide
            });
            node.material.needsUpdate = true;
          }
        }
      });

      registry[key] = { model, mixer, clips, gltf, animations: gltf.animations, currentAction: null, currentClipName: '' };
      console.log(`[CharacterManager] Loaded "${key}" — available clips:`, Object.keys(clips));
      return registry[key];

    } catch (err) {
      console.error(`[CharacterManager] Critical failure loading "${key}":`, err);
      return _makePlaceholder(key);
    }
  }

  function _makePlaceholder(key) {
    const group  = new THREE.Group();
    const body   = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), new THREE.MeshStandardMaterial({ color: 0x7c3aed }));
    body.position.y = 1.0;
    group.add(body);
    const entry = { model: group, mixer: null, clips: {}, currentAction: null, currentClipName: '', placeholder: true };
    registry[key] = entry;
    return entry;
  }

  function getClipDuration(key, clipName) {
    const entry = registry[key];
    if (!entry || !entry.clips) return 0;
    const normalizedName = clipName.toLowerCase().replace(/.*\|/, '').trim();
    const action = entry.clips[clipName] || entry.clips[normalizedName];
    if (action && typeof action.getClip === 'function') {
      const clip = action.getClip();
      return clip ? clip.duration : 0;
    }
    return 0;
  }

  function playAnim(key, clipName, options = {}) {
    const entry = registry[key];
    if (!entry || !entry.mixer) return;

    const normalizedName = clipName.toLowerCase().replace(/.*\|/, '').trim();
    const targetAction = entry.clips[clipName] || entry.clips[normalizedName] || Object.values(entry.clips)[0];
    if (!targetAction) return;

    const {
      duration = 0.2,
      loop = THREE.LoopRepeat,
      clamp = false,
      force = false
    } = options;

    const isSameAction = entry.currentAction === targetAction;

    // If already playing this looping animation and not forced, do nothing
    if (isSameAction && !force && loop === THREE.LoopRepeat && targetAction.isRunning()) {
      return;
    }

    targetAction.enabled = true;
    targetAction.setEffectiveTimeScale(1);
    targetAction.setEffectiveWeight(1);
    targetAction.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
    targetAction.clampWhenFinished = clamp;
    targetAction.reset();

    if (entry.currentAction && entry.currentAction !== targetAction) {
      entry.currentAction.fadeOut(duration);
    }
    targetAction.fadeIn(duration).play();

    entry.currentAction = targetAction;
    entry.currentClipName = clipName;
  }

  function update(delta) {
    for (const entry of Object.values(registry)) if (entry.mixer) entry.mixer.update(delta);
  }

  return { load, playAnim, getClipDuration, update, get: k => registry[k], getModel: k => registry[k]?.model };
})();

