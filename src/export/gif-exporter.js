// ============================================================
// oas-fingerprint-sdk — GIF Exporter
// ============================================================
// Renders the particle cloud into an animated GIF.
// Uses a minimal pure-JS GIF89a encoder (no dependencies).
//
// The GIF captures one full transmission cycle of the
// fingerprint — enough for a verifier to decode.
// ============================================================

const { ParticleSystem } = require('../renderers/particle-system');
const { DEFAULTS } = require('../core/protocol');

// ============================================================
// Minimal GIF89a Encoder
// ============================================================

class GIFEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.frames = [];
  }

  addFrame(pixels, delay = 100) {
    // pixels: Uint8Array of RGB values (width * height * 3)
    // delay: in milliseconds
    this.frames.push({ pixels, delay });
  }

  encode() {
    const parts = [];

    // Header
    parts.push(this._str('GIF89a'));

    // Logical screen descriptor
    const globalPalette = this._buildGlobalPalette();
    const palSize = globalPalette.length / 3;
    const palBits = Math.ceil(Math.log2(palSize)) - 1;

    parts.push(this._u16(this.width));
    parts.push(this._u16(this.height));
    parts.push(new Uint8Array([
      0x80 | (palBits << 4) | palBits, // GCT flag, color res, GCT size
      0,    // bg color index
      0,    // pixel aspect ratio
    ]));

    // Global color table
    parts.push(globalPalette);

    // Netscape looping extension
    parts.push(new Uint8Array([
      0x21, 0xFF, 0x0B,
      ...this._strBytes('NETSCAPE2.0'),
      0x03, 0x01,
      0x00, 0x00, // loop count (0 = infinite)
      0x00,
    ]));

    // Frames
    for (const frame of this.frames) {
      const indexed = this._quantize(frame.pixels, globalPalette);

      // Graphic control extension
      const delayCs = Math.round(frame.delay / 10);
      parts.push(new Uint8Array([
        0x21, 0xF9, 0x04,
        0x00,                // no transparency
        delayCs & 0xFF, (delayCs >> 8) & 0xFF,
        0x00,                // transparent color index
        0x00,
      ]));

      // Image descriptor
      parts.push(new Uint8Array([0x2C]));
      parts.push(this._u16(0)); // left
      parts.push(this._u16(0)); // top
      parts.push(this._u16(this.width));
      parts.push(this._u16(this.height));
      parts.push(new Uint8Array([0x00])); // no local color table

      // LZW compressed data
      const minCodeSize = Math.max(2, palBits + 1);
      const compressed = this._lzwEncode(indexed, minCodeSize);
      parts.push(new Uint8Array([minCodeSize]));

      // Sub-blocks
      let offset = 0;
      while (offset < compressed.length) {
        const chunk = Math.min(255, compressed.length - offset);
        parts.push(new Uint8Array([chunk]));
        parts.push(compressed.slice(offset, offset + chunk));
        offset += chunk;
      }
      parts.push(new Uint8Array([0x00])); // block terminator
    }

    // Trailer
    parts.push(new Uint8Array([0x3B]));

    // Concat
    let totalLen = 0;
    for (const p of parts) totalLen += p.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of parts) {
      out.set(p instanceof Uint8Array ? p : new Uint8Array(p), pos);
      pos += p.length;
    }
    return out;
  }

  _buildGlobalPalette() {
    // 256-color palette: dark-to-bright green/cyan ramp + grays
    const pal = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      if (i < 64) {
        // Greens: dark to bright
        const t = i / 63;
        pal[i*3]   = Math.round(3 + t * 30);    // R
        pal[i*3+1] = Math.round(3 + t * 200);   // G
        pal[i*3+2] = Math.round(5 + t * 120);   // B
      } else if (i < 128) {
        // Cyans
        const t = (i - 64) / 63;
        pal[i*3]   = Math.round(3 + t * 50);
        pal[i*3+1] = Math.round(80 + t * 175);
        pal[i*3+2] = Math.round(100 + t * 155);
      } else if (i < 192) {
        // Whites (for particle cores)
        const t = (i - 128) / 63;
        const v = Math.round(60 + t * 195);
        pal[i*3] = pal[i*3+1] = pal[i*3+2] = v;
      } else {
        // Dark grays to black (background)
        const t = (i - 192) / 63;
        const v = Math.round(t * 15);
        pal[i*3] = v;
        pal[i*3+1] = v;
        pal[i*3+2] = Math.round(v * 1.2);
      }
    }
    // Index 0 = background
    pal[0] = 3; pal[1] = 3; pal[2] = 5;
    return pal;
  }

  _quantize(rgb, palette) {
    const n = this.width * this.height;
    const indexed = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = rgb[i*3], g = rgb[i*3+1], b = rgb[i*3+2];
      indexed[i] = this._nearestColor(r, g, b, palette);
    }
    return indexed;
  }

  _nearestColor(r, g, b, pal) {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < 256; i++) {
      const dr = r - pal[i*3], dg = g - pal[i*3+1], db = b - pal[i*3+2];
      const dist = dr*dr + dg*dg + db*db;
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }

  _lzwEncode(indexed, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const maxCode = 4096;

    const table = new Map();
    for (let i = 0; i < clearCode; i++) table.set(String(i), i);

    const output = [];
    let bits = 0, bitCount = 0;

    const emit = (code) => {
      bits |= (code << bitCount);
      bitCount += codeSize;
      while (bitCount >= 8) {
        output.push(bits & 0xFF);
        bits >>= 8;
        bitCount -= 8;
      }
    };

    emit(clearCode);

    let current = String(indexed[0]);
    for (let i = 1; i < indexed.length; i++) {
      const next = String(indexed[i]);
      const combined = current + ',' + next;

      if (table.has(combined)) {
        current = combined;
      } else {
        emit(table.get(current));
        if (nextCode < maxCode) {
          table.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          emit(clearCode);
          table.clear();
          for (let j = 0; j < clearCode; j++) table.set(String(j), j);
          nextCode = eoiCode + 1;
          codeSize = minCodeSize + 1;
        }
        current = next;
      }
    }

    emit(table.get(current));
    emit(eoiCode);

    if (bitCount > 0) output.push(bits & 0xFF);

    return new Uint8Array(output);
  }

  _str(s) { return new Uint8Array([...s].map(c => c.charCodeAt(0))); }
  _strBytes(s) { return [...s].map(c => c.charCodeAt(0)); }
  _u16(v) { return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]); }
}

// ============================================================
// GIF Export Function
// ============================================================

class GIFExporter {
  /**
   * Export an animated GIF of the particle fingerprint.
   * @param {object} opts
   * @returns {Uint8Array} GIF file bytes
   */
  static export(opts = {}) {
    const W = opts.width || 200;
    const H = opts.height || 200;
    const fps = opts.fps || 15;
    const dataFps = opts.dataFps || DEFAULTS.dataFps;
    const frames = opts.frames || [];
    const totalFrames = frames.length;
    const finderCells = opts.finderCells || DEFAULTS.finderCells;
    const gridSize = opts.gridSize || DEFAULTS.gridSize;
    const did = opts.did || '';

    // One full cycle + sync frame
    const cycleDuration = (totalFrames + 1) / dataFps;
    const totalGIFFrames = Math.ceil(cycleDuration * fps);
    const delay = Math.round(1000 / fps);

    const R = Math.min(W, H) * 0.38;
    const CX = W / 2, CY = H / 2;
    const fov = 400;

    const particles = new ParticleSystem({
      did,
      count: Math.min(2000, opts.particleCount || 2000),
      radius: R,
      hueRange: opts.hueRange || DEFAULTS.hueRange,
    });

    // Build cell state timeline
    const CC = gridSize * gridSize;
    const cellTimeline = [];

    // Sync frame
    const syncCells = new Float32Array(CC);
    for (let i = 0; i < CC; i++) {
      if (finderCells.includes(i)) syncCells[i] = 1;
      else {
        const col = i % gridSize, row = (i / gridSize) | 0;
        syncCells[i] = (col + row) % 2 === 0 ? 1 : 0;
      }
    }
    cellTimeline.push(syncCells);

    // Data frames
    for (const bits of frames) {
      const cells = new Float32Array(CC);
      let di = 0;
      for (let i = 0; i < CC; i++) {
        cells[i] = finderCells.includes(i) ? 1 : (bits[di++] || 0);
      }
      cellTimeline.push(cells);
    }

    const gif = new GIFEncoder(W, H);

    for (let f = 0; f < totalGIFFrames; f++) {
      const t = f / fps;

      // Which data frame are we on?
      const dataFrameIdx = Math.min(
        cellTimeline.length - 1,
        Math.floor(t * dataFps)
      );
      const cellStates = cellTimeline[dataFrameIdx];

      // Update particles
      particles.update(t);

      // Render to RGB buffer
      const rgb = new Uint8Array(W * H * 3);
      // Background
      for (let i = 0; i < W * H; i++) {
        rgb[i*3] = 3; rgb[i*3+1] = 3; rgb[i*3+2] = 5;
      }

      const sorted = particles.sorted();

      for (const p of sorted) {
        const ci = ParticleSystem.cellFor(p.x, p.y, R, gridSize);
        let dm = 1;
        if (ci >= 0 && ci < CC) dm = 0.05 + cellStates[ci] * 0.95;

        const sc = fov / (fov + p.z + R);
        const sx = CX + p.x * sc;
        const sy = CY + p.y * sc;
        const da = 0.2 + 0.8 * ((p.z + R) / (2 * R));
        const fa = p.al * dm * da;
        if (fa < 0.02) continue;

        const radius = Math.max(1, p.sz * sc * (0.8 + dm * 2));
        const hue = p.hu / 360;
        const [pr, pg, pb] = hslToRgb(hue, p.sa / 100, 0.55 + dm * 0.15);

        // Soft dot
        const ir = Math.ceil(radius);
        for (let dy = -ir; dy <= ir; dy++) {
          for (let dx = -ir; dx <= ir; dx++) {
            const px = Math.round(sx + dx);
            const py = Math.round(sy + dy);
            if (px < 0 || px >= W || py < 0 || py >= H) continue;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > radius) continue;
            const falloff = (1 - dist / radius);
            const alpha = fa * falloff * falloff * 0.6;
            const idx = (py * W + px) * 3;
            rgb[idx]   = Math.min(255, rgb[idx]   + pr * alpha);
            rgb[idx+1] = Math.min(255, rgb[idx+1] + pg * alpha);
            rgb[idx+2] = Math.min(255, rgb[idx+2] + pb * alpha);
          }
        }

        // Core
        if (dm > 0.3 && fa > 0.05) {
          const cpx = Math.round(sx), cpy = Math.round(sy);
          if (cpx >= 0 && cpx < W && cpy >= 0 && cpy < H) {
            const ci2 = (cpy * W + cpx) * 3;
            const ca = fa * 0.4;
            rgb[ci2]   = Math.min(255, rgb[ci2]   + 255 * ca);
            rgb[ci2+1] = Math.min(255, rgb[ci2+1] + 255 * ca);
            rgb[ci2+2] = Math.min(255, rgb[ci2+2] + 255 * ca);
          }
        }
      }

      gif.addFrame(rgb, delay);
    }

    return gif.encode();
  }
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

module.exports = { GIFExporter, GIFEncoder };
