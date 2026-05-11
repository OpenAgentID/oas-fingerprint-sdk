// ============================================================
// oas-fingerprint-sdk — Terminal Renderer
// ============================================================
// Renders the particle fingerprint as animated Unicode block
// characters in a terminal. Agents capture this via stdout.
//
// Uses braille characters (⠁⠂⠃...⣿) for high-resolution
// density rendering within each terminal cell.
// ============================================================

const { DEFAULTS } = require('../core/protocol');

const BRAILLE_BASE = 0x2800;
// Braille dot mapping for 2x4 grid within each character:
// [0] [3]
// [1] [4]
// [2] [5]
// [6] [7]
const BRAILLE_MAP = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

// Block elements for lower-res fallback
const BLOCKS = [' ', '░', '▒', '▓', '█'];

class TerminalRenderer {
  constructor(opts = {}) {
    this.frames = opts.frames || [];
    this.totalFrames = opts.totalFrames || 0;
    this.finderCells = opts.finderCells || DEFAULTS.finderCells;
    this.gridSize = opts.gridSize || DEFAULTS.gridSize;
    this.dataFps = opts.dataFps || DEFAULTS.dataFps;
    this.did = opts.did || '';
    this.stream = opts.stream || process.stdout;
    this.width = opts.width || 32; // terminal columns for the grid
    this.useBraille = opts.useBraille !== false;

    this._timer = null;
    this._frameIdx = 0;
    this._isSync = true;
    this._cellStates = new Float32Array(this.gridSize * this.gridSize).fill(1);
    this._smoothStates = new Float32Array(this.gridSize * this.gridSize).fill(1);
  }

  start() {
    // Hide cursor
    this.stream.write('\x1b[?25l');
    this._timer = setInterval(() => this._tick(), 1000 / this.dataFps);
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // Show cursor, reset
    this.stream.write('\x1b[?25h\n');
  }

  _tick() {
    this._updateFrame();
    this._smoothTransition();
    this._render();
  }

  _updateFrame() {
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
      if (this._frameIdx < this.totalFrames) {
        const bits = this.frames[this._frameIdx];
        let di = 0;
        for (let i = 0; i < CC; i++) {
          this._cellStates[i] = FC.includes(i) ? 1 : (bits[di++] || 0);
        }
        this._frameIdx++;
        if (this._frameIdx >= this.totalFrames) this._isSync = true;
      }
    }
  }

  _smoothTransition() {
    for (let i = 0; i < this._cellStates.length; i++) {
      this._smoothStates[i] += (this._cellStates[i] - this._smoothStates[i]) * 0.3;
    }
  }

  _render() {
    const G = this.gridSize;
    const FC = this.finderCells;
    const cellW = Math.max(2, Math.floor(this.width / G));
    const lines = [];

    // Header
    lines.push(`\x1b[2m${this.did}\x1b[0m`);
    lines.push('');

    for (let row = 0; row < G; row++) {
      let line = ' ';
      for (let col = 0; col < G; col++) {
        const ci = row * G + col;
        const val = this._smoothStates[ci];
        const isFinder = FC.includes(ci);

        if (isFinder) {
          // Finder: bright green
          line += `\x1b[92m${BLOCKS[4].repeat(cellW)}\x1b[0m`;
        } else {
          // Data cell
          const blockIdx = Math.min(4, Math.max(0, Math.round(val * 4)));
          const color = val > 0.5 ? '\x1b[36m' : '\x1b[90m'; // cyan or dim
          line += `${color}${BLOCKS[blockIdx].repeat(cellW)}\x1b[0m`;
        }
      }
      lines.push(line);
    }

    lines.push('');
    lines.push(`\x1b[2mFrame ${this._frameIdx}/${this.totalFrames}  ●  ${this.dataFps}fps\x1b[0m`);

    // Move cursor to top and redraw
    const totalLines = lines.length;
    this.stream.write(`\x1b[${totalLines + 1}A`); // move up
    this.stream.write(lines.join('\n') + '\n');
  }

  /** Get a single frame as a string (for programmatic capture by agents) */
  captureFrame() {
    this._updateFrame();
    const G = this.gridSize;
    const bits = [];
    for (let i = 0; i < G * G; i++) {
      bits.push(this._cellStates[i] > 0.5 ? 1 : 0);
    }
    return bits;
  }

  /** Get the raw cell brightness values (for agent decoding) */
  captureCellValues() {
    this._updateFrame();
    return Array.from(this._cellStates);
  }
}

module.exports = { TerminalRenderer };
