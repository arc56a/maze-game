const ProfileUI = (() => {
  let selectedGender = 'hero';
  let tempGender = null;
  const registry_previews = {};

  const CHARACTERS = [
    { id: 'hero', name: 'المغامرة', path: 'characters/models/female/female_1.glb' }
  ];

  function init() {
    const profile = JSON.parse(localStorage.getItem('maze3d_profile') || '{}');
    if (profile.name) {
      UI.showScreen('menu');
      _updateMenuName();
    } else {
      UI.showScreen('profile');
      setTimeout(_initPreviews, 100);
    }
  }

  async function _initPreviews() {
    _createPreview('hero', CHARACTERS[0].path, 'preview-hero');
  }

  async function _createPreview(gender, modelPath, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    _disposePreview(containerId);
    await new Promise(r => setTimeout(r, 30));

    const width = container.clientWidth || 160;
    const height = container.clientHeight || 160;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.1, 2.6);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const dir = new THREE.DirectionalLight(0xffffff, 2.2);
    dir.position.set(1, 2, 3);
    scene.add(dir);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
    fillLight.position.set(-1, 1, -1);
    scene.add(fillLight);

    try {
      const entry = await CharacterManager.load(gender + "_preview", modelPath);
      const cloneFn = (window.SkeletonUtils && window.SkeletonUtils.clone) || (THREE.SkeletonUtils && THREE.SkeletonUtils.clone);
      const model = cloneFn ? cloneFn(entry.model) : entry.model.clone();
      scene.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const animList = entry.animations || entry.gltf?.animations || [];
      registry_previews[containerId] = {
        mixer,
        animations: animList,
        renderer,
        frameId: null
      };

      const idle = animList.find(a => a.name.toLowerCase().includes('idle'));
      if (idle) {
        mixer.clipAction(idle).play();
      } else if (animList.length > 0) {
        mixer.clipAction(animList[0]).play();
      }

      let lastTime = performance.now();
      function animate() {
        const cur = UI.getCurrent();
        if (!['profile', 'account', 'char-select', 'menu', 'settings'].includes(cur)) {
          _disposePreview(containerId);
          return;
        }
        registry_previews[containerId].frameId = requestAnimationFrame(animate);
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        mixer.update(delta);
        model.rotation.y += delta * 0.6;
        renderer.render(scene, camera);
      }
      animate();
    } catch (e) {
      console.error("Preview failed:", e);
    }
  }

  function _disposePreview(id) {
    const p = registry_previews[id];
    if (!p) return;
    if (p.frameId) cancelAnimationFrame(p.frameId);
    if (p.renderer) {
      p.renderer.dispose();
      p.renderer.forceContextLoss();
      if (p.renderer.domElement) p.renderer.domElement.remove();
    }
    delete registry_previews[id];
  }

  function selectGender(gender) {
    selectedGender = gender;
    document.getElementById('card-hero')?.classList.toggle('active', true);
    _triggerWave('preview-hero');
    if (window.TelegramAPI) TelegramAPI.haptic('light');
  }

  function _triggerWave(id) {
    const p = registry_previews[id];
    if (!p || !p.animations || !p.mixer) return;
    const wave = p.animations.find(a => a.name.toLowerCase().includes('wave'));
    const idle = p.animations.find(a => a.name.toLowerCase().includes('idle'));
    if (!wave) return;

    const wAct = p.mixer.clipAction(wave);
    wAct.reset().setLoop(THREE.LoopOnce).play();
    wAct.clampWhenFinished = true;

    if (idle) {
      const iAct = p.mixer.clipAction(idle);
      iAct.fadeOut(0.3);
      wAct.fadeIn(0.3);
      setTimeout(() => {
        iAct.reset().fadeIn(0.6).play();
        wAct.fadeOut(0.6);
      }, 1600);
    }
  }

  function save() {
    const nameInput = document.getElementById('profile-name');
    const name = nameInput ? nameInput.value.trim() : "";
    if (!(/^[a-zA-Z\u0600-\u06FF\s]{3,15}$/.test(name))) {
      const err = document.getElementById('name-error');
      if (err) err.classList.add('visible');
      return;
    }
    localStorage.setItem('maze3d_profile', JSON.stringify({
      name, gender: selectedGender, createdAt: Date.now()
    }));
    _updateMenuName();
    UI.showScreen('menu');
    UI.toast('أهلاً بك في المغامرة!', 'success');
  }

  async function updateAccountScreen() {
    const profile = JSON.parse(localStorage.getItem('maze3d_profile') || '{}');
    const progress = JSON.parse(localStorage.getItem('maze3d_progress') || '{}');

    tempGender = 'hero';

    const nameInput = document.getElementById('acc-name-input');
    if (nameInput) nameInput.value = profile.name || '';

    const label = document.getElementById('acc-gender-label');
    label.textContent = CHARACTERS[0].name;

    const container = document.getElementById('acc-preview-box');
    if (container) {
      container.innerHTML = '';
      _createPreview('hero', CHARACTERS[0].path, 'acc-preview-box');
    }

    const progressValues = Object.values(progress);
    const levelsEl = document.getElementById('acc-levels');
    if (levelsEl) levelsEl.textContent = progressValues.filter(p => p.stars > 0).length;

    let totalSeconds = 0;
    progressValues.forEach(p => { if (p.best && p.best !== Infinity) totalSeconds += p.best; });
    const totalMinutes = Math.floor(totalSeconds / 60);

    const timeEl = document.getElementById('acc-time');
    if (timeEl) timeEl.textContent = totalMinutes > 60 ? `${(totalMinutes/60).toFixed(1)} ساعة` : `${totalMinutes} دقيقة`;

    const ageDays = Math.floor((Date.now() - (profile.createdAt || Date.now())) / (1000 * 60 * 60 * 24));
    const ageEl = document.getElementById('acc-age');
    if (ageEl) ageEl.textContent = ageDays === 0 ? "جديد (اليوم)" : `${ageDays} يوم`;
  }

  function updateCharSelectScreen() {
    const list = document.getElementById('char-list');
    if (!list) return;
    list.innerHTML = '';

    CHARACTERS.forEach(char => {
      const item = document.createElement('div');
      item.className = 'char-item active';
      const pid = `sel-pre-${char.id}`;
      item.innerHTML = `<div class="char-item-preview" id="${pid}"></div><span class="char-item-name">${char.name}</span>`;

      item.onclick = () => {
        UI.showScreen('account');
      };
      list.appendChild(item);
      _createPreview(char.id, char.path, pid);
    });
  }

  function saveAccountChanges() {
    const nameInput = document.getElementById('acc-name-input');
    const name = nameInput ? nameInput.value.trim() : "";
    if (!(/^[a-zA-Z\u0600-\u06FF\s]{3,15}$/.test(name))) {
      UI.toast('الاسم غير صالح!', 'error');
      return;
    }
    const profile = JSON.parse(localStorage.getItem('maze3d_profile') || '{}');
    profile.name = name;
    profile.gender = 'hero';
    localStorage.setItem('maze3d_profile', JSON.stringify(profile));
    _updateMenuName();
    UI.toast('تم الحفظ بنجاح!', 'success');
  }

  function resetAccount() {
    if (confirm('هل أنت متأكد؟ سيتم حذف جميع البيانات!')) {
      localStorage.removeItem('maze3d_profile');
      localStorage.removeItem('maze3d_progress');
      location.reload();
    }
  }

  function _updateMenuName() {
    const profile = JSON.parse(localStorage.getItem('maze3d_profile') || '{}');
    if (profile.name) {
      localStorage.setItem('maze3d_player_name', profile.name);
    }
    if (window.UI && typeof UI.updateMenuPlayerMini === 'function') {
      UI.updateMenuPlayerMini();
    }
  }

  return {
    init, selectGender, save, updateAccountScreen,
    updateCharSelectScreen, saveAccountChanges, resetAccount
  };
})();
