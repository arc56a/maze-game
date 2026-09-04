/**
 * AtmosphereData.js
 * Constants, Phase Palettes, and Celestial Mathematics
 */

const AtmosphereData = (() => {
  // ── Celestial Constants ──────────────────────────────
  const ORBIT_RADIUS = 190;
  const CENTER_X     = 40;
  const CENTER_Z     = 40;

  // ── Sky phase color palettes ──────────────────────────
  const PHASES = {
    night:   { zenith: [0.05, 0.06, 0.12], horizon: [0.06, 0.06, 0.14], ground: [0.03, 0.03, 0.06], fogColor: [0.03, 0.03, 0.07], fogDensity: 0.006, ambIntensity: 0.10, ambColor: [0.15, 0.18, 0.35] },
    dawn:    { zenith: [0.12, 0.10, 0.25], horizon: [0.85, 0.42, 0.15], ground: [0.08, 0.06, 0.10], fogColor: [0.35, 0.20, 0.12], fogDensity: 0.007, ambIntensity: 0.25, ambColor: [0.60, 0.42, 0.28] },
    morning: { zenith: [0.25, 0.55, 0.95], horizon: [0.70, 0.88, 1.00], ground: [0.12, 0.28, 0.12], fogColor: [0.65, 0.82, 0.98], fogDensity: 0.003, ambIntensity: 0.45, ambColor: [0.88, 0.92, 1.00] },
    noon:    { zenith: [0.15, 0.38, 0.92], horizon: [0.60, 0.80, 1.00], ground: [0.14, 0.30, 0.14], fogColor: [0.72, 0.88, 1.00], fogDensity: 0.002, ambIntensity: 0.55, ambColor: [1.00, 1.00, 1.00] },
    golden:  { zenith: [0.10, 0.15, 0.45], horizon: [1.00, 0.60, 0.15], ground: [0.18, 0.10, 0.06], fogColor: [0.92, 0.52, 0.18], fogDensity: 0.005, ambIntensity: 0.40, ambColor: [1.00, 0.72, 0.42] },
    sunset:  { zenith: [0.06, 0.06, 0.22], horizon: [0.82, 0.28, 0.10], ground: [0.08, 0.05, 0.04], fogColor: [0.58, 0.18, 0.08], fogDensity: 0.007, ambIntensity: 0.25, ambColor: [0.85, 0.40, 0.20] },
    dusk:    { zenith: [0.04, 0.04, 0.14], horizon: [0.20, 0.08, 0.22], ground: [0.04, 0.03, 0.06], fogColor: [0.08, 0.05, 0.12], fogDensity: 0.008, ambIntensity: 0.15, ambColor: [0.22, 0.14, 0.30] },
  };

  function getPhaseWeights(h) {
    const timeline = [
      { h: 0,  phase: 'night'   },
      { h: 5,  phase: 'dawn'    },
      { h: 7,  phase: 'morning' },
      { h: 10, phase: 'noon'    },
      { h: 17, phase: 'golden'  },
      { h: 18, phase: 'sunset'  },
      { h: 19, phase: 'dusk'    },
      { h: 24, phase: 'night'   },
    ];

    for (let i = 0; i < timeline.length - 1; i++) {
      if (h >= timeline[i].h && h < timeline[i + 1].h) {
        const t = (h - timeline[i].h) / (timeline[i + 1].h - timeline[i].h);
        return { p1: timeline[i].phase, p2: timeline[i + 1].phase, t: _smoothstep(t) };
      }
    }
    return { p1: 'night', p2: 'night', t: 0 };
  }

  function _smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function lerpPhase(h) {
    const { p1, p2, t } = getPhaseWeights(h);
    const a = PHASES[p1];
    const b = PHASES[p2];
    const lerp = (x, y) => x + (y - x) * t;
    const lerpArr = (x, y) => x.map((v, i) => lerp(v, y[i]));
    return {
      zenith:       lerpArr(a.zenith, b.zenith),
      horizon:      lerpArr(a.horizon, b.horizon),
      ground:       lerpArr(a.ground, b.ground),
      fogColor:     lerpArr(a.fogColor, b.fogColor),
      fogDensity:   lerp(a.fogDensity, b.fogDensity),
      ambIntensity: lerp(a.ambIntensity, b.ambIntensity),
      ambColor:     lerpArr(a.ambColor, b.ambColor),
    };
  }

  function getCelestialPos(h, riseHour, centerPos) {
    const elapsed = ((h - riseHour + 24) % 24);
    const angle   = (elapsed / 12) * Math.PI;
    const cx = centerPos ? centerPos.x : CENTER_X;
    const cz = centerPos ? centerPos.z : CENTER_Z;

    const orbitInclination = 35;
    const x = cx + Math.cos(Math.PI - angle) * ORBIT_RADIUS;
    const y = Math.sin(angle) * ORBIT_RADIUS;
    const z = cz + Math.cos(angle) * orbitInclination;
    return { x, y, z };
  }

  function getSunVisibility(h) {
    const elapsed = ((h - 6 + 24) % 24);
    if (elapsed > 12) return 0.0;
    const fade = Math.min(elapsed / 0.5, 1.0) * Math.min((12 - elapsed) / 0.5, 1.0);
    return Math.max(0, Math.min(1, fade));
  }

  function getSunColorIntensity(h) {
    if (h >= 6  && h < 7)  return { color: 0xff8833, intensity: 2.5 };
    if (h >= 7  && h < 10) return { color: 0xffe0b0, intensity: 4.5 };
    if (h >= 10 && h < 17) return { color: 0xffffff, intensity: 6.0 };
    if (h >= 17 && h < 18) return { color: 0xffaa55, intensity: 3.5 };
    if (h >= 18 && h < 19) return { color: 0xff6633, intensity: 1.8 };
    return { color: 0x000000, intensity: 0.0 };
  }

  function getMoonVisibility(h) {
    const elapsed = ((h - 18 + 24) % 24);
    if (elapsed > 12) return 0.0;
    const fade = Math.min(elapsed / 0.5, 1.0) * Math.min((12 - elapsed) / 0.5, 1.0);
    return Math.max(0, Math.min(1, fade));
  }

  return {
    ORBIT_RADIUS, CENTER_X, CENTER_Z,
    lerpPhase, getCelestialPos, getSunVisibility, getSunColorIntensity, getMoonVisibility
  };
})();
