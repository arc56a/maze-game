/**
 * SkyVisuals.js
 * Handles SkyMesh, StarField, Sun, and Moon Sprites
 */

const SkyVisuals = (() => {
  let skyMesh, starField, sunSprite, sunAuraSprite, moonSprite, moonAuraSprite;
  let skyUniforms = null;
  let cachedMoonTex = null;

  async function createSun(scene) {
    try {
      const rawTex = await AssetLoader.loadTexture('assets/textures/sky/sun.jpg');
      const canvasCore = document.createElement('canvas');
      canvasCore.width = 1024; canvasCore.height = 1024;
      const ctxCore = canvasCore.getContext('2d');
      if (rawTex && rawTex.image) ctxCore.drawImage(rawTex.image, 0, 0, 1024, 1024);

      ctxCore.globalCompositeOperation = 'destination-in';
      const gradCore = ctxCore.createRadialGradient(512, 512, 400, 512, 512, 508);
      gradCore.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
      gradCore.addColorStop(0.88, 'rgba(0, 0, 0, 1.0)');
      gradCore.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctxCore.fillStyle = gradCore;
      ctxCore.beginPath(); ctxCore.arc(512, 512, 510, 0, Math.PI * 2); ctxCore.fill();

      const maskedTexCore = new THREE.CanvasTexture(canvasCore);
      maskedTexCore.colorSpace = THREE.SRGBColorSpace;
      maskedTexCore.needsUpdate = true;

      const matCore = new THREE.SpriteMaterial({
        map: maskedTexCore, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, depthTest: true
      });
      sunSprite = new THREE.Sprite(matCore);
      sunSprite.name = 'SunSprite'; sunSprite.scale.set(62, 62, 1); sunSprite.renderOrder = -10; sunSprite.visible = false;
      scene.add(sunSprite);

      const matAura = new THREE.SpriteMaterial({
        map: maskedTexCore, color: 0xffdd88, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, depthTest: true
      });
      sunAuraSprite = new THREE.Sprite(matAura);
      sunAuraSprite.name = 'SunAuraSprite'; sunAuraSprite.scale.set(92, 92, 1); sunAuraSprite.renderOrder = -11; sunAuraSprite.visible = false;
      scene.add(sunAuraSprite);
    } catch (e) {
      console.warn('[SkyVisuals] Sun fallback:', e);
      sunSprite = new THREE.Mesh(new THREE.SphereGeometry(14), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
      scene.add(sunSprite);
    }
  }

  async function createMoon(scene) {
    try {
      if (!cachedMoonTex) {
        const rawTex = await AssetLoader.loadTexture('assets/textures/sky/moon.jpg');
        const SZ = 512; const canvas = document.createElement('canvas');
        canvas.width = SZ; canvas.height = SZ; const ctx = canvas.getContext('2d');
        if (rawTex && rawTex.image) {
          ctx.save(); ctx.beginPath(); ctx.arc(SZ/2, SZ/2, SZ*0.47, 0, Math.PI*2); ctx.clip();
          ctx.drawImage(rawTex.image, 0, 0, SZ, SZ); ctx.restore();
          ctx.globalCompositeOperation = 'destination-in';
          const grad = ctx.createRadialGradient(SZ/2, SZ/2, SZ*0.44, SZ/2, SZ/2, SZ*0.475);
          grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)'); grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(SZ/2, SZ/2, SZ/2, 0, Math.PI*2); ctx.fill();
        }
        cachedMoonTex = new THREE.CanvasTexture(canvas);
        cachedMoonTex.colorSpace = THREE.SRGBColorSpace;
      }
      moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cachedMoonTex, color: 0xddeeff, transparent: true, blending: THREE.NormalBlending, fog: false, depthWrite: false, depthTest: true }));
      moonSprite.scale.set(50, 50, 1); moonSprite.renderOrder = -10; scene.add(moonSprite);
      moonAuraSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cachedMoonTex, color: 0x99bbdd, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, fog: false, depthWrite: false, depthTest: true }));
      moonAuraSprite.scale.set(78, 78, 1); moonAuraSprite.renderOrder = -11; scene.add(moonAuraSprite);
    } catch (e) {
      moonSprite = new THREE.Mesh(new THREE.SphereGeometry(12), new THREE.MeshBasicMaterial({ color: 0xddeeff }));
      scene.add(moonSprite);
    }
  }

  function createStarField(scene) {
    const count = 3000; const pos = new Float32Array(count * 3); const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2; const phi = Math.acos(Math.random() * 0.95); const r = 360;
      pos[i*3] = AtmosphereData.CENTER_X + r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.cos(phi);
      pos[i*3+2] = AtmosphereData.CENTER_Z + r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = Math.random() * 2.5 + 0.6;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starField = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, sizeAttenuation: true, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    starField.renderOrder = -50; scene.add(starField);
  }

  function createSkyShader(scene) {
    skyUniforms = { zenithColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() }, groundColor: { value: new THREE.Color() } };
    const mat = new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vWorldPosition; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 zenithColor; uniform vec3 horizonColor; uniform vec3 groundColor; varying vec3 vWorldPosition; void main() { float h = normalize(vWorldPosition).y; vec3 col; if (h > 0.0) col = mix(horizonColor, zenithColor, pow(h, 0.45)); else col = mix(horizonColor, groundColor, pow(-h, 0.3)); gl_FragColor = vec4(col, 1.0); }`,
      uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, depthTest: false
    });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    skyMesh.renderOrder = -100; skyMesh.position.set(AtmosphereData.CENTER_X, 0, AtmosphereData.CENTER_Z);
    scene.add(skyMesh);
  }

  function update(h, delta, targetPos, sunVis, moonVis, solarAnimTime) {
    const phase = AtmosphereData.lerpPhase(h);
    if (skyUniforms) {
      skyUniforms.zenithColor.value.setRGB(...phase.zenith);
      skyUniforms.horizonColor.value.setRGB(...phase.horizon);
      skyUniforms.groundColor.value.setRGB(...phase.ground);
    }
    const sp = AtmosphereData.getCelestialPos(h, 6, targetPos);
    if (sunSprite) {
      sunSprite.visible = sp.y > 0 && sunVis > 0 && !_sunOccluded;
      sunSprite.position.set(sp.x, sp.y, sp.z);
      sunSprite.material.rotation += delta * 0.008;
      const pulse = 1.0 + Math.sin(solarAnimTime * 0.55) * 0.025;
      sunSprite.scale.set(62 * pulse, 62 * pulse, 1);
      const t = Math.max(0, Math.sin(Math.atan2(sp.y, Math.sqrt(sp.x*sp.x + sp.z*sp.z))));
      sunSprite.material.color.setRGB(1.0, THREE.MathUtils.lerp(0.55, 1.0, t), THREE.MathUtils.lerp(0.20, 0.95, t));
      sunSprite.material.opacity = sunVis;
    }
    if (sunAuraSprite) {
      sunAuraSprite.visible = sunSprite ? sunSprite.visible : false;
      sunAuraSprite.position.set(sp.x, sp.y, sp.z);
      sunAuraSprite.material.rotation -= delta * 0.006;
      const pulse = 1.0 + Math.sin(solarAnimTime * 0.45 + 1.0) * 0.03;
      sunAuraSprite.scale.set(80 * pulse, 80 * pulse, 1);
      sunAuraSprite.material.opacity = sunVis * 0.16;
    }
    const mp = AtmosphereData.getCelestialPos(h, 18, targetPos);
    if (moonSprite) {
      moonSprite.visible = mp.y > 0 && moonVis > 0 && !_moonOccluded;
      moonSprite.position.set(mp.x, mp.y, mp.z);
      moonSprite.material.opacity = moonVis * 0.97;
    }
    if (moonAuraSprite) {
      moonAuraSprite.visible = moonSprite ? moonSprite.visible : false;
      moonAuraSprite.position.set(mp.x, mp.y, mp.z);
      moonAuraSprite.material.opacity = moonVis * 0.16;
    }
    if (starField) {
      let op = 0; if (h >= 19 || h < 5) op = 1.0; else if (h >= 5 && h < 7) op = 1.0 - (h - 5) / 2; else if (h >= 18 && h < 19) op = (h - 18);
      starField.material.opacity = op * 0.95;
    }
  }

  let _sunOccluded = false;
  let _moonOccluded = false;

  function setSunOccluded(occluded) {
    _sunOccluded = !!occluded;
    if (sunSprite && _sunOccluded) sunSprite.visible = false;
    if (sunAuraSprite && _sunOccluded) sunAuraSprite.visible = false;
  }

  function setMoonOccluded(occluded) {
    _moonOccluded = !!occluded;
    if (moonSprite && _moonOccluded) moonSprite.visible = false;
    if (moonAuraSprite && _moonOccluded) moonAuraSprite.visible = false;
  }

  function dispose(scene) {
    [skyMesh, starField, sunSprite, sunAuraSprite, moonSprite, moonAuraSprite].forEach(o => { if(o) { scene.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); } });
    skyMesh = starField = sunSprite = sunAuraSprite = moonSprite = moonAuraSprite = null;
  }

  return {
    createSun, createMoon, createStarField, createSkyShader,
    update, setSunOccluded, setMoonOccluded, dispose
  };
})();
