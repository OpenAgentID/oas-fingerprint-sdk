// ============================================================
// oas-fingerprint-sdk — Particle System
// ============================================================
// Shared particle physics for the dust cloud. Used by all
// renderers (Canvas, GIF exporter, Image exporter, Terminal).
//
// The particle system is deterministic given a seed — same DID
// produces the same cloud structure. Density modulation is
// layered on top for data encoding.
// ============================================================

const { DEFAULTS } = require('../core/protocol');

function hashToSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

// Simple seeded PRNG (mulberry32)
function prng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ParticleSystem {
  /**
   * @param {object} opts
   * @param {string} opts.did - DID string (used as seed for deterministic layout)
   * @param {number} opts.count - Number of particles
   * @param {number} opts.radius - Orb radius in pixels
   * @param {number[]} opts.hueRange - [min, max] hue in degrees
   */
  constructor(opts = {}) {
    this.did = opts.did || 'default';
    this.count = opts.count || DEFAULTS.particleCount;
    this.radius = opts.radius || 150;
    this.hueRange = opts.hueRange || DEFAULTS.hueRange;
    this.particles = [];
    this._init();
  }

  _init() {
    const rand = prng(hashToSeed(this.did));
    const R = this.radius;
    const [hMin, hMax] = this.hueRange;

    this.particles = [];
    for (let i = 0; i < this.count; i++) {
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      const rr = R * (0.12 + Math.pow(rand(), 0.45) * 0.88);

      this.particles.push({
        oR: rr, oTh: th, oPh: ph,
        x: 0, y: 0, z: 0,
        sz: 0.2 + rand() * 0.85,
        al: 0.1 + rand() * 0.5,
        hu: hMin + rand() * (hMax - hMin),
        sa: 45 + rand() * 45,
        sp: 0.2 + rand() * 0.8,
        ph: rand() * Math.PI * 2,
        drift: (rand() - 0.5) * 0.25,
      });
    }
  }

  /**
   * Update particle positions for a given time.
   * @param {number} t - Time in seconds
   * @param {object} opts - { swirlMult?, breathMult?, radiusMult? }
   */
  update(t, opts = {}) {
    const R = this.radius;
    const sm = opts.swirlMult || 1;
    const bm = opts.breathMult || 1;
    const rm = opts.radiusMult || 1;

    for (const p of this.particles) {
      const sw = t * p.sp * 0.35 * sm;
      const th = p.oTh + sw;
      const phO = p.oPh + Math.sin(t * 0.25 * bm + p.ph) * 0.18;
      const rO = p.oR * rm * (1 + Math.sin(t * 0.4 * bm + p.ph * 2) * 0.07);

      p.x = rO * Math.sin(phO) * Math.cos(th);
      p.y = rO * Math.sin(phO) * Math.sin(th);
      p.z = rO * Math.cos(phO);

      const br = 1 + Math.sin(t * 0.35 * bm) * 0.04;
      p.x *= br; p.y *= br; p.z *= br;
      p.y += Math.sin(t * 0.6 + p.ph) * p.drift * R * 0.05;
    }
  }

  /**
   * Get particles sorted by z-depth (back to front).
   */
  sorted() {
    return [...this.particles].sort((a, b) => a.z - b.z);
  }

  /**
   * Determine which grid cell a particle's x,y falls into.
   */
  static cellFor(x, y, radius, gridSize) {
    const col = Math.floor(((x / radius + 1) / 2) * gridSize);
    const row = Math.floor(((y / radius + 1) / 2) * gridSize);
    if (col < 0 || col >= gridSize || row < 0 || row >= gridSize) return -1;
    return row * gridSize + col;
  }
}

module.exports = { ParticleSystem, prng, hashToSeed };
