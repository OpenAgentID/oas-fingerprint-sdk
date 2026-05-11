// ============================================================
// oas-fingerprint-sdk — Image Exporter (Still PNG)
// ============================================================
// Renders a single frame of the particle cloud.
// The still image uses DID-seeded particle positions to create
// a unique visual fingerprint. Not enough data for full
// verification, but enough for visual identity on profiles.
// ============================================================

const { ParticleSystem } = require('../renderers/particle-system');
const { DEFAULTS } = require('../core/protocol');

class ImageExporter {
  /**
   * Export a still image of the particle fingerprint.
   * Returns raw RGBA pixel data (for use with canvas.toBlob/toDataURL
   * in browser, or sharp/canvas in Node).
   *
   * @param {object} opts
   * @returns {{ width, height, pixels: Uint8ClampedArray }}
   */
  static export(opts = {}) {
    const W = opts.width || 400;
    const H = opts.height || 400;
    const did = opts.did || '';
    const gridSize = opts.gridSize || DEFAULTS.gridSize;
    const finderCells = opts.finderCells || DEFAULTS.finderCells;
    const frames = opts.frames || [];

    // Use first data frame for the still (or all-1s if no frames)
    const cellStates = new Float32Array(gridSize * gridSize).fill(1);
    if (frames.length > 0) {
      const bits = frames[0];
      let di = 0;
      for (let i = 0; i < gridSize * gridSize; i++) {
        cellStates[i] = finderCells.includes(i) ? 1 : (bits[di++] || 0);
      }
    }

    const R = Math.min(W, H) * DEFAULTS.orbRadiusFactor;
    const CX = W / 2, CY = H / 2;
    const fov = 700;

    const particles = new ParticleSystem({
      did,
      count: Math.min(opts.particleCount || DEFAULTS.particleCount, 3000),
      radius: R,
      hueRange: opts.hueRange || DEFAULTS.hueRange,
    });

    // Render at t=0 (deterministic snapshot)
    particles.update(0);

    // Create pixel buffer
    const pixels = new Uint8ClampedArray(W * H * 4);

    // Fill background
    const bg = parseColor(opts.background || '#030305');
    for (let i = 0; i < W * H; i++) {
      pixels[i * 4] = bg[0];
      pixels[i * 4 + 1] = bg[1];
      pixels[i * 4 + 2] = bg[2];
      pixels[i * 4 + 3] = 255;
    }

    // Render particles (simplified — no radial gradients, just soft dots)
    const sorted = particles.sorted();

    for (const p of sorted) {
      const ci = ParticleSystem.cellFor(p.x, p.y, R, gridSize);
      let dm = 1;
      if (ci >= 0 && ci < cellStates.length) dm = 0.04 + cellStates[ci] * 0.96;

      const sc = fov / (fov + p.z + R);
      const sx = CX + p.x * sc;
      const sy = CY + p.y * sc;

      const da = 0.25 + 0.75 * ((p.z + R) / (2 * R));
      const fa = p.al * dm * da;
      if (fa < 0.01) continue;

      const radius = p.sz * sc * (1.2 + dm * 2);
      const hu = p.hu;

      // Convert HSL to RGB
      const [r, g, b] = hslToRgb(hu / 360, p.sa / 100, 0.65);

      // Draw soft circle (additive blending)
      const ir = Math.ceil(radius);
      for (let dy = -ir; dy <= ir; dy++) {
        for (let dx = -ir; dx <= ir; dx++) {
          const px = Math.round(sx + dx);
          const py = Math.round(sy + dy);
          if (px < 0 || px >= W || py < 0 || py >= H) continue;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;

          const falloff = 1 - dist / radius;
          const alpha = fa * falloff * falloff * 0.7;
          const idx = (py * W + px) * 4;

          // Additive blend
          pixels[idx] = Math.min(255, pixels[idx] + r * alpha);
          pixels[idx + 1] = Math.min(255, pixels[idx + 1] + g * alpha);
          pixels[idx + 2] = Math.min(255, pixels[idx + 2] + b * alpha);
        }
      }

      // White core
      if (dm > 0.3) {
        const coreR = Math.max(p.sz * sc * 0.3, 0.5);
        const cir = Math.ceil(coreR);
        for (let dy = -cir; dy <= cir; dy++) {
          for (let dx = -cir; dx <= cir; dx++) {
            const px = Math.round(sx + dx);
            const py = Math.round(sy + dy);
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > coreR) continue;
            const alpha = fa * 0.4 * (1 - dist / coreR);
            const idx = (py * W + px) * 4;
            pixels[idx] = Math.min(255, pixels[idx] + 255 * alpha);
            pixels[idx + 1] = Math.min(255, pixels[idx + 1] + 255 * alpha);
            pixels[idx + 2] = Math.min(255, pixels[idx + 2] + 255 * alpha);
          }
        }
      }
    }

    return { width: W, height: H, pixels };
  }
}

function parseColor(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

module.exports = { ImageExporter };
