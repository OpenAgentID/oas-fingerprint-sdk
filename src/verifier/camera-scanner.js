// ============================================================
// oas-fingerprint-sdk — Camera Scanner
// ============================================================
// Real-time frame analysis from a video element.
// Detects finder cells, extracts bit patterns, accumulates
// frames, and triggers verification on complete payload.
// ============================================================

class CameraScanner {
  constructor(videoElement, opts = {}) {
    this.video = videoElement;
    this.framing = opts.framing;
    this.onProgress = opts.onProgress || (() => {});
    this.onVerified = opts.onVerified || (() => {});
    this.onFailed = opts.onFailed || (() => {});
    this.onSync = opts.onSync || (() => {});
    this.onFrame = opts.onFrame || (() => {}); // raw cell values per frame

    this.gridSize = this.framing.gridSize;
    this.finderCells = this.framing.finderCells;
    this.dataFps = this.framing.dataFps;

    this._canvas = null;
    this._ctx = null;
    this._running = false;
    this._synced = false;
    this._frames = [];
    this._timer = null;
    this._analyzeSize = 640;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._synced = false;
    this._frames = [];

    // Create offscreen canvas for analysis
    if (typeof OffscreenCanvas !== 'undefined') {
      this._canvas = new OffscreenCanvas(this._analyzeSize, this._analyzeSize);
    } else {
      this._canvas = document.createElement('canvas');
      this._canvas.width = this._analyzeSize;
      this._canvas.height = this._analyzeSize;
    }
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

    this._timer = setInterval(() => this._tick(), 1000 / this.dataFps);
  }

  stop() {
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  reset() {
    this._synced = false;
    this._frames = [];
  }

  _tick() {
    if (!this._running) return;
    if (this.video.readyState < 2) return;

    const brightness = this._analyzeBrightness();
    if (!brightness) return;

    const bits = this._threshold(brightness);
    this.onFrame(bits, brightness);

    if (!this._synced) {
      if (this.framing.isSyncFrame(bits)) {
        this._synced = true;
        this._frames = [];
        this.onSync();
      }
      return;
    }

    // Data frame
    if (!this.framing.isSyncFrame(bits)) {
      const dataBits = this.framing.extractData(bits);
      this._frames.push(dataBits);

      const result = this.framing.decode(this._frames);
      if (result.partial) {
        this.onProgress(result.progress, this._frames.length);
      } else if (!result.errors) {
        this.stop();
        this._verify(result.data, result.corrected);
      } else {
        this.onFailed({ error: 'Decode errors', corrected: result.corrected });
      }
    } else {
      // Another sync frame — check if we have enough
      if (this._frames.length > 0) {
        const result = this.framing.decode(this._frames);
        if (!result.partial && !result.errors) {
          this.stop();
          this._verify(result.data, result.corrected);
          return;
        }
      }
      this._frames = [];
      this.onSync();
    }
  }

  async _verify(payload, corrected) {
    try {
      const { DIDCrypto } = require('../core/did-crypto');
      const result = await DIDCrypto.verifyPayload(payload);
      if (result.valid) {
        this.onVerified({ ...result, corrected });
      } else {
        this.onFailed({ ...result, corrected });
      }
    } catch (e) {
      this.onFailed({ error: e.message });
    }
  }

  _analyzeBrightness() {
    const sz = this._analyzeSize;
    this._ctx.drawImage(this.video, 0, 0, sz, sz);
    const imageData = this._ctx.getImageData(0, 0, sz, sz);
    const px = imageData.data;
    const cellW = sz / this.gridSize;
    const total = this.gridSize * this.gridSize;

    const brightness = new Float32Array(total);
    const counts = new Float32Array(total);

    for (let ci = 0; ci < total; ci++) {
      const col = ci % this.gridSize, row = (ci / this.gridSize) | 0;
      // Sample inner 60% of cell
      const x0 = ((col + 0.2) * cellW) | 0;
      const x1 = ((col + 0.8) * cellW) | 0;
      const y0 = ((row + 0.2) * cellW) | 0;
      const y1 = ((row + 0.8) * cellW) | 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * sz + x) * 4;
          // Green-weighted for particle glow detection
          brightness[ci] += px[idx] * 0.2 + px[idx + 1] * 0.6 + px[idx + 2] * 0.2;
          counts[ci]++;
        }
      }
      brightness[ci] /= counts[ci] || 1;
    }

    return brightness;
  }

  _threshold(brightness) {
    const total = this.gridSize * this.gridSize;

    // Use finder cells as known-bright reference
    let finderAvg = 0;
    for (const fi of this.finderCells) finderAvg += brightness[fi];
    finderAvg /= this.finderCells.length;

    // Adaptive threshold: use finder brightness as reference
    // Non-finder cells > 40% of finder brightness → 1
    const threshold = finderAvg * 0.4;

    // Also compute median of non-finder cells as fallback
    const nonFinder = [];
    for (let i = 0; i < total; i++) {
      if (!this.finderCells.includes(i)) nonFinder.push(brightness[i]);
    }
    nonFinder.sort((a, b) => a - b);
    const median = nonFinder[(nonFinder.length / 2) | 0];

    // Use the more conservative of the two
    const effectiveThreshold = Math.max(threshold, median);

    const bits = new Array(total).fill(0);
    for (let i = 0; i < total; i++) {
      bits[i] = this.finderCells.includes(i) ? 1 : (brightness[i] > effectiveThreshold ? 1 : 0);
    }
    return bits;
  }
}

module.exports = { CameraScanner };
