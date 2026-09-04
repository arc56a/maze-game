/**
 * LightSystem.js
 * Comprehensive Dynamic Lighting System for the Engine.
 * Supports various light types: Fire, Lamp, Spotlight, and Pulsating lights.
 * Features: Flickering, Jittering, Color shifting, and Static modes.
 */

const LightSystem = (() => {
  const activeLights = [];

  const LightType = {
    FIRE: 'fire',
    LAMP: 'lamp',
    SPOT: 'spot',
    PULSE: 'pulse',
    STATIC: 'static'
  };

  /**
   * Creates a dynamic or static light based on the specified type.
   * @param {string} type - 'fire', 'lamp', 'spot', 'pulse', 'static'
   * @param {Object} options - Configuration parameters
   */
  function create(type = 'fire', options = {}) {
    let light;
    const color = options.color || (type === 'fire' ? 0xffa95c : 0xffffff);
    const intensity = options.intensity || (type === 'spot' ? 100 : 20);
    const distance = options.distance || 15;
    const decay = options.decay || 2;

    // Create the base Three.js light object
    if (type === 'spot') {
      light = new THREE.SpotLight(color, intensity, distance);
      light.angle = options.angle || Math.PI / 6;
      light.penumbra = options.penumbra || 0.3;
    } else {
      light = new THREE.PointLight(color, intensity, distance, decay);
    }

    // Shadow configuration
    const shadowsEnabled = (window.Settings && typeof Settings.get === 'function') ? (Settings.get('shadows') !== false) : true;
    light.castShadow = (options.castShadow !== false) && shadowsEnabled;

    if (light.castShadow) {
      light.shadow.bias = options.shadowBias || -0.002;
      light.shadow.mapSize.set(512, 512);
      light.shadow.radius = 2;
    }

    // Attach custom properties for the animation loop
    light.lightType = type;
    light.baseIntensity = intensity;
    light.basePosition = new THREE.Vector3();
    light.baseColor = new THREE.Color(color);

    // Animation settings
    light.animOptions = {
      flickerSpeed: options.flickerSpeed || (type === 'fire' ? 0.15 : 0.05),
      flickerStrength: options.flickerStrength || (type === 'fire' ? 0.3 : 0.05),
      jitter: options.jitter || (type === 'fire' ? 0.08 : 0),
      pulseSpeed: options.pulseSpeed || 2.0,
      colorShift: options.colorShift || (type === 'fire'),
      isStatic: options.isStatic || (type === 'static')
    };

    // Store base position once added to scene for jitter calculations
    light.addEventListener('added', () => {
      light.basePosition.copy(light.position);
    });

    if (!light.animOptions.isStatic) {
      activeLights.push(light);
    }

    return light;
  }

  /**
   * Main update loop for all non-static lights.
   */
  function update(delta, elapsed) {
    for (let i = activeLights.length - 1; i >= 0; i--) {
      const light = activeLights[i];

      // Skip if not in scene or marked for removal
      if (!light.parent) continue;

      const opt = light.animOptions;

      switch (light.lightType) {
        case LightType.FIRE:
          _updateFire(light, elapsed, opt);
          break;
        case LightType.LAMP:
          _updateLamp(light, elapsed, opt);
          break;
        case LightType.PULSE:
          _updatePulse(light, elapsed, opt);
          break;
        case LightType.SPOT:
          _updateSpot(light, elapsed, opt);
          break;
      }
    }
  }

  // --- Animation Strategies ---

  function _updateFire(light, elapsed, opt) {
    // 1. Organic Intensity Flicker (Mixed Perlin-like Sines)
    const noise = Math.sin(elapsed * 12 * opt.flickerSpeed) * 0.2 +
                  Math.sin(elapsed * 28 * opt.flickerSpeed) * 0.1 +
                  (Math.random() - 0.5) * opt.flickerStrength;
    light.intensity = light.baseIntensity * (1.0 + noise);

    // 2. Flame Jitter
    if (opt.jitter > 0) {
      light.position.x = light.basePosition.x + (Math.random() - 0.5) * opt.jitter;
      light.position.y = light.basePosition.y + (Math.random() - 0.5) * opt.jitter;
      light.position.z = light.basePosition.z + (Math.random() - 0.5) * opt.jitter;
    }

    // 3. Color Heat Variation
    if (opt.colorShift) {
      const hueShift = Math.sin(elapsed * 4) * 0.02;
      light.color.setHSL(0.08 + hueShift, 0.95, 0.6);
    }
  }

  function _updateLamp(light, elapsed, opt) {
    // Subtle electric hum/flicker
    if (Math.random() > 0.98) {
      light.intensity = light.baseIntensity * (0.9 + Math.random() * 0.1);
    } else {
      light.intensity = THREE.MathUtils.lerp(light.intensity, light.baseIntensity, 0.1);
    }
  }

  function _updatePulse(light, elapsed, opt) {
    // Smooth rhythmic pulsing
    const pulse = (Math.sin(elapsed * opt.pulseSpeed) + 1) / 2;
    light.intensity = light.baseIntensity * (0.5 + pulse * 0.5);
  }

  function _updateSpot(light, elapsed, opt) {
    // Spotlights might flicker if configured, or just stay steady
    if (opt.flickerStrength > 0) {
      const noise = (Math.random() - 0.5) * opt.flickerStrength;
      light.intensity = light.baseIntensity * (1.0 + noise);
    }
  }

  /**
   * Removes a light from the system.
   */
  function remove(light) {
    const idx = activeLights.indexOf(light);
    if (idx !== -1) activeLights.splice(idx, 1);
  }

  function clear() {
    activeLights.length = 0;
  }

  // Auto-register with engine
  if (typeof Engine !== 'undefined' && Engine.onUpdate) {
    Engine.onUpdate(update);
  }

  return {
    create,
    update,
    remove,
    clear,
    Type: LightType
  };
})();
