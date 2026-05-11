// ============================================================
// oas-fingerprint-sdk — Canvas Renderer
// ============================================================
// Renders the particle dust cloud on an HTML Canvas.
// Handles frame sequencing and density modulation.
// ============================================================

const { ParticleSystem } = require('./particle-system');
const { DEFAULTS } = require('../core/protocol');

class CanvasRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.frames = opts.frames || [];
    this.totalFrames = opts.totalFrames || 0;
    this.finderCells = opts.finderCells || DEFAULTS.finderCells;
    this.gridSize = opts.gridSize || DEFAULTS.gridSize;
    this.dataFps = opts.dataFps || DEFAULTS.dataFps;
    this.did = opts.did || '';
    this.background = opts.background || '#030305';
    this.showDebug = false;

    this._dpr = (typeof devicePixelRatio !== 'undefined') ? devicePixelRatio : 1;
    this._W = canvas.width;
    this._H = canvas.height;
    this._CX = this._W / 2;
    this._CY = this._H / 2;

    this._particles = new ParticleSystem({
      did: this.did,
      count: opts.particleCount || DEFAULTS.particleCount,
      radius: Math.min(this._W, this._H) * (opts.orbRadiusFactor || DEFAULTS.orbRadiusFactor),
      hueRange: opts.hueRange || DEFAULTS.hueRange,
    });

    this._cellStates = new Float32Array(this.gridSize * this.gridSize).fill(1);
    this._smoothStates = new Float32Array(this.gridSize * this.gridSize).fill(1);
    this._frameIdx = 0;
    this._isSync = true;
    this._lastDataTime = 0;
    this._running = false;
    this._paused = false;
    this._rafId = null;
  }

  start() {
    this._running = true;
    this._rafId = requestAnimationFrame(ts => this._loop(ts));
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; }
  toggleDebug() { this.showDebug = !this.showDebug; }

  _loop(ts) {
    if (!this._running) return;
    const t = ts * 0.001;

    if (!this._paused) {
      this._updateDataFrame(ts);
      this._smoothTransition();
    }

    this._render(t);
    this._rafId = requestAnimationFrame(ts2 => this._loop(ts2));
  }

  _updateDataFrame(ts) {
    if (this.frames.length === 0) return;
    if (ts - this._lastDataTime < 1000 / this.dataFps) return;
    this._lastDataTime = ts;

    const G = this.gridSize;
    const CC = G * G;
    const FC = this.finderCells;

    if (this._isSync) {
      for (let i = 0; i < CC; i++) {
        if (FC.includes(i)) { this._cellStates[i] = 1; continue; }
        const col = i % G, row = (i / G) | 0;
        this._cellStates[i] = (col + row) % 2 === 0 ? 1 : 0;
      }
      this._isSync = false;
      this._frameIdx = 0;
    } else {
      const bits = this.frames[this._frameIdx];
      let di = 0;
      for (let i = 0; i < CC; i++) {
        this._cellStates[i] = FC.includes(i) ? 1 : (bits[di++] || 0);
      }
      this._frameIdx++;
      if (this._frameIdx >= this.totalFrames) this._isSync = true;
    }
  }

  _smoothTransition() {
    for (let i = 0; i < this._cellStates.length; i++) {
      this._smoothStates[i] += (this._cellStates[i] - this._smoothStates[i]) * 0.13;
    }
  }

  _render(t) {
    const ctx = this.ctx;
    const W = this._W, H = this._H;
    const CX = this._CX, CY = this._CY;
    const R = this._particles.radius;
    const fov = 700;

    // Fade
    ctx.fillStyle = 'rgba(3,3,5,0.15)';
    ctx.fillRect(0, 0, W, H);

    // Update particle positions
    this._particles.update(t);
    const sorted = this._particles.sorted();

    for (const p of sorted) {
      const ci = ParticleSystem.cellFor(p.x, p.y, R, this.gridSize);
      let dm = 1;
      if (ci >= 0 && ci < this._smoothStates.length) {
        dm = 0.04 + this._smoothStates[ci] * 0.96;
      }

      const sc = fov / (fov + p.z + R);
      const sx = CX + p.x * sc;
      const sy = CY + p.y * sc;
      const sz = p.sz * sc * this._dpr;

      const da = 0.25 + 0.75 * ((p.z + R) / (2 * R));
      const fa = p.al * dm * da;
      if (fa < 0.008) continue;

      const gl = sz * (1.2 + dm * 2.8);
      const hu = p.hu + Math.sin(t * 0.7 + p.ph) * 6;

      // Glow
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, gl);
      g.addColorStop(0, `hsla(${hu},${p.sa}%,78%,${fa * 0.85})`);
      g.addColorStop(0.35, `hsla(${hu},${p.sa}%,55%,${fa * 0.25})`);
      g.addColorStop(1, `hsla(${hu},${p.sa}%,35%,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, gl, 0, Math.PI * 2);
      ctx.fill();

      // Core speck
      if (dm > 0.25) {
        ctx.fillStyle = `rgba(255,255,255,${fa * 0.55})`;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(sz * 0.25, 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (this.showDebug) this._renderDebug(R, fov, CX, CY);
  }

  _renderDebug(R, fov, CX, CY) {
    const ctx = this.ctx;
    const G = this.gridSize;
    const sc = fov / (fov + R);
    const gp = R * 2 * sc;
    const sx = CX - R * sc, sy = CY - R * sc;
    const cw = gp / G;

    ctx.strokeStyle = 'rgba(110,231,183,0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= G; i++) {
      ctx.beginPath(); ctx.moveTo(sx + i * cw, sy); ctx.lineTo(sx + i * cw, sy + gp); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx, sy + i * cw); ctx.lineTo(sx + gp, sy + i * cw); ctx.stroke();
    }

    ctx.font = `${cw * 0.28}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < G * G; i++) {
      const col = i % G, row = (i / G) | 0;
      const cx = sx + (col + 0.5) * cw, cy = sy + (row + 0.5) * cw;
      if (this.finderCells.includes(i)) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('F', cx, cy);
      } else {
        ctx.fillStyle = this._cellStates[i] > 0.5
          ? 'rgba(110,231,183,0.45)' : 'rgba(255,70,87,0.25)';
        ctx.fillText(this._cellStates[i] > 0.5 ? '1' : '0', cx, cy);
      }
    }
  }
}

module.exports = { CanvasRenderer };
