/**
 * LensFlareManager.js
 * Procedural Cinematic Lens Flare System
 */

const LensFlareManager = (() => {
  let flareGroup = null;
  let flareSprites = [];

  function init(scene) {
    flareGroup = new THREE.Group(); flareGroup.name = 'LensFlareSystem'; scene.add(flareGroup);
    const defs = [
      { t: 0.16, size: 8,  color: 0xffdc82, opacity: 0.22, hex: true },
      { t: 0.32, size: 24, color: 0x8cd2f5, opacity: 0.25, ring: true },
      { t: 0.48, size: 13, color: 0xffbe5a, opacity: 0.14, hex: true },
      { t: 0.68, size: 28, color: 0xb48ce6, opacity: 0.08, hex: true },
      { t: 0.92, size: 6,  color: 0x82e1f5, opacity: 0.26, hex: true },
      { t: 1.18, size: 38, color: 0xffd778, opacity: 0.18, ring: true },
      { t: 1.42, size: 16, color: 0x6ec8d7, opacity: 0.10, hex: true },
      { t: 1.68, size: 26, color: 0xb4a0f0, opacity: 0.15, ring: true },
      { t: -0.25, size: 9, color: 0xffaa50, opacity: 0.12, hex: true }
    ];
    defs.forEach(def => {
      const tex = _createTexture(def.hex, def.ring);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: def.color, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false
      }));
      sprite.renderOrder = 20; flareGroup.add(sprite);
      flareSprites.push({ sprite, t: def.t, baseSize: def.size, baseOpacity: def.opacity });
    });
  }

  function _createTexture(isHex, isRing) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const ctx = canvas.getContext('2d'); const c = 64;
    if (isHex) {
      ctx.beginPath(); for (let i=0; i<6; i++) { const a=(i*Math.PI)/3; const x=c+60*Math.cos(a); const y=c+60*Math.sin(a); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.closePath(); ctx.fillStyle='white'; ctx.fill();
    } else if (isRing) {
      ctx.beginPath(); ctx.arc(c,c,58,0,Math.PI*2); ctx.lineWidth=4; ctx.strokeStyle='white'; ctx.stroke();
    } else {
      const grad = ctx.createRadialGradient(c,c,0,c,c,64); grad.addColorStop(0,'white'); grad.addColorStop(1,'transparent'); ctx.fillStyle=grad; ctx.fillRect(0,0,128,128);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function update(sunPos, sunVis, delta) {
    if (!flareGroup) return;
    const camera = (typeof CameraController !== 'undefined' && CameraController.getActive) ? CameraController.getActive() : null;
    if (!camera) return;

    let targetOp = 0;
    if (sunVis > 0) {
      const sunScreen = new THREE.Vector3(sunPos.x, sunPos.y, sunPos.z).project(camera);
      if (sunScreen.z < 1.0 && Math.abs(sunScreen.x) < 1.5 && Math.abs(sunScreen.y) < 1.5) {
        targetOp = sunVis * Math.max(0, 1.0 - Math.sqrt(sunScreen.x*sunScreen.x + sunScreen.y*sunScreen.y) * 0.7);
      }
    }

    const sunScreen = new THREE.Vector3(sunPos.x, sunPos.y, sunPos.z).project(camera);
    const dx = -sunScreen.x; const dy = -sunScreen.y;
    const dampSpeed = targetOp === 0 ? 16.0 : 6.0;

    flareSprites.forEach(f => {
      f.sprite.material.opacity = THREE.MathUtils.damp(f.sprite.material.opacity, targetOp * f.baseOpacity, dampSpeed, delta);
      if (f.sprite.material.opacity > 0.001) {
        f.sprite.visible = true;
        const v = new THREE.Vector3(sunScreen.x + dx * f.t, sunScreen.y + dy * f.t, 0.5).unproject(camera);
        f.sprite.position.copy(camera.position).add(v.sub(camera.position).normalize().multiplyScalar(4));
        const s = f.baseSize * 0.015; f.sprite.scale.set(s, s, 1);
      } else {
        f.sprite.visible = false;
      }
    });
  }

  function dispose(scene) {
    if (flareGroup) { scene.remove(flareGroup); flareSprites.forEach(f => { if(f.sprite.material.map) f.sprite.material.map.dispose(); f.sprite.material.dispose(); }); }
    flareGroup = null; flareSprites = [];
  }

  return { init, update, dispose };
})();
