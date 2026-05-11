// ============================================================
// oas-fingerprint-sdk — Protocol Constants & Framing
// ============================================================

const { ReedSolomon } = require('./reed-solomon');

const DEFAULTS = {
  gridSize: 8,
  finderCells: [0, 7, 56, 63],
  dataCells: 60,
  dataFps: 8,
  eccSymbols: 32,
  syncThreshold: 0.78,
  particleCount: 5000,
  orbRadiusFactor: 0.21,
  hueRange: [152, 196],
  challengeTTL: 30000, // 30 seconds
};

class ProtocolFraming {
  constructor(opts = {}) {
    this.gridSize = opts.gridSize || DEFAULTS.gridSize;
    this.finderCells = opts.finderCells || DEFAULTS.finderCells;
    this.dataCells = opts.dataCells || DEFAULTS.dataCells;
    this.dataFps = opts.dataFps || DEFAULTS.dataFps;
    this.rs = new ReedSolomon(opts.eccSymbols || DEFAULTS.eccSymbols);
    this.syncThreshold = opts.syncThreshold || DEFAULTS.syncThreshold;

    this.cellToData = [];
    let idx = 0;
    const total = this.gridSize * this.gridSize;
    for (let i = 0; i < total; i++)
      this.cellToData.push(this.finderCells.includes(i) ? -1 : idx++);
  }

  /** Encode raw payload bytes → array of frame bit arrays */
  encode(payload) {
    const encoded = this.rs.encode(payload);
    const bits = [];
    for (let b = 15; b >= 0; b--) bits.push((payload.length >> b) & 1);
    for (let b = 15; b >= 0; b--) bits.push((encoded.length >> b) & 1);
    for (const byte of encoded) for (let b = 7; b >= 0; b--) bits.push((byte >> b) & 1);
    while (bits.length % this.dataCells !== 0) bits.push(0);
    const frames = [];
    for (let i = 0; i < bits.length; i += this.dataCells)
      frames.push(bits.slice(i, i + this.dataCells));
    return { frames, totalFrames: frames.length, encodedLength: encoded.length };
  }

  /** Decode accumulated frame bit arrays → payload bytes */
  decode(frames) {
    const all = frames.flat();
    if (all.length < 32) return { data: null, partial: true, progress: 0 };
    let origLen = 0, encLen = 0;
    for (let i = 0; i < 16; i++) origLen = (origLen << 1) | all[i];
    for (let i = 16; i < 32; i++) encLen = (encLen << 1) | all[i];
    const data = all.slice(32);
    const need = encLen * 8;
    if (data.length < need)
      return { data: null, partial: true, progress: data.length / need, origLen, encLen };
    const received = new Uint8Array(encLen);
    for (let i = 0; i < encLen; i++) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | data[i * 8 + j];
      received[i] = byte;
    }
    const result = this.rs.decode(received);
    return {
      data: result.data.slice(0, origLen),
      partial: false,
      progress: 1,
      corrected: result.corrected,
      errors: result.errors,
    };
  }

  /** Generate sync frame cell pattern */
  syncFrame() {
    const total = this.gridSize * this.gridSize;
    const bits = new Array(total).fill(0);
    for (let i = 0; i < total; i++) {
      if (this.finderCells.includes(i)) bits[i] = 1;
      else {
        const col = i % this.gridSize, row = (i / this.gridSize) | 0;
        bits[i] = (col + row) % 2 === 0 ? 1 : 0;
      }
    }
    return bits;
  }

  /** Check if cell pattern is a sync frame */
  isSyncFrame(bits) {
    let m = 0, t = 0;
    for (let i = 0; i < bits.length; i++) {
      if (this.finderCells.includes(i)) continue;
      const col = i % this.gridSize, row = (i / this.gridSize) | 0;
      if (bits[i] === ((col + row) % 2 === 0 ? 1 : 0)) m++;
      t++;
    }
    return m / t > this.syncThreshold;
  }

  /** Extract data bits from full cell pattern */
  extractData(bits) {
    return bits.filter((_, i) => !this.finderCells.includes(i));
  }

  /** Map data bits → full cell array */
  dataToCells(dataBits) {
    const total = this.gridSize * this.gridSize;
    const cells = new Array(total).fill(0);
    let di = 0;
    for (let i = 0; i < total; i++)
      cells[i] = this.finderCells.includes(i) ? 1 : (dataBits[di++] || 0);
    return cells;
  }

  /** Compute transmission time in seconds */
  transmissionTime(payloadBytes) {
    const { totalFrames } = this.encode(new Uint8Array(payloadBytes));
    return (totalFrames + 1) / this.dataFps;
  }
}

module.exports = { ProtocolFraming, DEFAULTS };
