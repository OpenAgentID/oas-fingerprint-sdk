// ============================================================
// oas-fingerprint-sdk — Presenter (Fingerprint)
// ============================================================
// The agent-side API. Generates particle identity, renders it,
// exports to GIF/PNG, and solves challenges.
// ============================================================

const { ProtocolFraming, DEFAULTS } = require('../core/protocol');
const { DIDCrypto } = require('../core/did-crypto');
const { bytesToHex, multibaseEncode } = require('../core/oas');

class Fingerprint {
  constructor() {
    this.keyPair = null;
    this.did = null;
    this.publicKeyHex = null;
    this.publicKeyMultibase = null;
    this.publicKeyJwk = null;
    this.payload = null;
    this.frames = null;
    this.totalFrames = 0;
    this.framing = new ProtocolFraming();
    this._initialized = false;
  }

  // ==========================================================
  // INITIALIZATION
  // ==========================================================

  /**
   * Generate a new fingerprint identity from scratch.
   * @param {object} opts - { platform?, subject?, type? }
   * @returns {Fingerprint} this (for chaining)
   */
  async generate(opts = {}) {
    const {
      keyPair,
      did,
      publicKeyHex,
      publicKeyMultibase,
      publicKeyJwk,
    } = await DIDCrypto.generateKeyPair(opts);
    this.keyPair = keyPair;
    this.did = did;
    this.publicKeyHex = publicKeyHex;
    this.publicKeyMultibase = publicKeyMultibase;
    this.publicKeyJwk = publicKeyJwk;
    await this._buildPayload(opts);
    this._initialized = true;
    return this;
  }

  /**
   * Restore a fingerprint from stored keys.
   * @param {object} privateJwk - Private key JWK
   * @param {object} publicJwk - Public key JWK
   * @param {string} did - The DID string
   */
  async restore(privateJwk, publicJwk, did, opts = {}) {
    this.keyPair = await DIDCrypto.importKeyPair(privateJwk, publicJwk);
    this.did = did;
    this.publicKeyJwk = publicJwk;
    const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', this.keyPair.publicKey));
    this.publicKeyHex = bytesToHex(pubRaw);
    this.publicKeyMultibase = multibaseEncode(pubRaw);
    await this._buildPayload(opts);
    this._initialized = true;
    return this;
  }

  /** Export keys for persistent storage */
  async exportKeys() {
    this._check();
    return {
      ...(await DIDCrypto.exportKeyPair(this.keyPair)),
      did: this.did,
      publicKeyMultibase: this.publicKeyMultibase,
    };
  }

  // ==========================================================
  // PAYLOAD & FRAMES
  // ==========================================================

  async _buildPayload(opts = {}) {
    const claim = DIDCrypto.createClaim(this.did, {
      platform: opts.platform || 'oas-fingerprint',
      subject: opts.subject,
      type: opts.type,
      publicKeyMultibase: this.publicKeyMultibase,
      name: opts.name,
      description: opts.description,
      metadata: opts.metadata,
      service: opts.service,
    });
    const { claimBytes } = await DIDCrypto.signClaim(this.keyPair, claim);
    this.payload = DIDCrypto.buildPayload(this.publicKeyMultibase, claimBytes);
    const result = this.framing.encode(this.payload);
    this.frames = result.frames;
    this.totalFrames = result.totalFrames;
  }

  /** Get the raw payload bytes (for direct transmission) */
  getPayload() { this._check(); return this.payload; }

  /** Get encoded frames (for custom renderers) */
  getFrames() { this._check(); return { frames: this.frames, totalFrames: this.totalFrames }; }

  /** Get transmission metadata */
  getMeta() {
    this._check();
    return {
      did: this.did,
      publicKeyHex: this.publicKeyHex,
      publicKeyMultibase: this.publicKeyMultibase,
      payloadBytes: this.payload.length,
      totalFrames: this.totalFrames,
      transmissionTime: (this.totalFrames + 1) / this.framing.dataFps,
      dataFps: this.framing.dataFps,
      eccSymbols: this.framing.rs.nsym,
      maxCorrectableErrors: Math.floor(this.framing.rs.nsym / 2),
    };
  }

  // ==========================================================
  // CHALLENGE-RESPONSE (PRESENTER SIDE)
  // ==========================================================

  /**
   * Solve a challenge from a verifier.
   * @param {string} challengeString - The challenge string received from the verifier
   * @returns {{ payload: Uint8Array, frames: number[][], totalFrames: number }}
   */
  async solveChallenge(challengeString) {
    this._check();
    const payload = await DIDCrypto.solveChallenge(
      this.keyPair, this.did, this.publicKeyMultibase, challengeString
    );
    const result = this.framing.encode(payload);
    return {
      payload,
      frames: result.frames,
      totalFrames: result.totalFrames,
    };
  }

  // ==========================================================
  // RENDERING — Canvas (Browser)
  // ==========================================================

  /**
   * Render live particle cloud into a canvas element.
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts - { width?, height?, background? }
   * @returns {FingerprintRenderer} controller with stop(), pause(), resume()
   */
  toCanvas(canvas, opts = {}) {
    this._check();
    // Dynamic import to avoid Node.js issues
    const { CanvasRenderer } = require('../renderers/canvas-renderer');
    const renderer = new CanvasRenderer(canvas, {
      ...opts,
      frames: this.frames,
      totalFrames: this.totalFrames,
      finderCells: this.framing.finderCells,
      gridSize: this.framing.gridSize,
      dataFps: this.framing.dataFps,
    });
    renderer.start();
    return renderer;
  }

  // ==========================================================
  // EXPORT — GIF
  // ==========================================================

  /**
   * Export an animated GIF of the particle fingerprint.
   * @param {object} opts - { width?, height?, duration?, fps?, quality? }
   * @returns {Promise<Uint8Array>} GIF file bytes
   */
  async toGIF(opts = {}) {
    this._check();
    const { GIFExporter } = require('../export/gif-exporter');
    return GIFExporter.export({
      frames: this.frames,
      totalFrames: this.totalFrames,
      finderCells: this.framing.finderCells,
      gridSize: this.framing.gridSize,
      dataFps: this.framing.dataFps,
      width: opts.width || 400,
      height: opts.height || 400,
      duration: opts.duration || null, // null = one full cycle
      fps: opts.fps || 20,
      quality: opts.quality || 10,
      background: opts.background || '#030305',
    });
  }

  // ==========================================================
  // EXPORT — Still Image (PNG)
  // ==========================================================

  /**
   * Export a still PNG of the particle fingerprint.
   * The still image encodes a subset of the DID in particle positions
   * (enough to identify but not fully verify — verification needs animation).
   * @param {object} opts - { width?, height?, background? }
   * @returns {Promise<Uint8Array>} PNG file bytes
   */
  async toImage(opts = {}) {
    this._check();
    const { ImageExporter } = require('../export/image-exporter');
    return ImageExporter.export({
      did: this.did,
      publicKeyHex: this.publicKeyHex,
      frames: this.frames,
      finderCells: this.framing.finderCells,
      gridSize: this.framing.gridSize,
      width: opts.width || 400,
      height: opts.height || 400,
      background: opts.background || '#030305',
    });
  }

  // ==========================================================
  // EXPORT — Terminal (ANSI)
  // ==========================================================

  /**
   * Render fingerprint to terminal as animated ANSI/Unicode.
   * @param {object} opts - { stream?, width?, fps? }
   * @returns {TerminalRenderer} controller with stop()
   */
  toTerminal(opts = {}) {
    this._check();
    const { TerminalRenderer } = require('../renderers/terminal-renderer');
    const renderer = new TerminalRenderer({
      ...opts,
      frames: this.frames,
      totalFrames: this.totalFrames,
      finderCells: this.framing.finderCells,
      gridSize: this.framing.gridSize,
      dataFps: this.framing.dataFps,
      did: this.did,
    });
    renderer.start();
    return renderer;
  }

  // ==========================================================
  // SERIALIZATION
  // ==========================================================

  /** Serialize to JSON (includes keys — handle securely) */
  async toJSON() {
    this._check();
    const keys = await this.exportKeys();
    return {
      version: '0.1.0',
      ...keys,
      publicKeyHex: this.publicKeyHex,
      publicKeyMultibase: this.publicKeyMultibase,
    };
  }

  /** Restore from serialized JSON */
  static async fromJSON(json, opts = {}) {
    const fp = new Fingerprint();
    await fp.restore(json.privateJwk, json.publicJwk, json.did, opts);
    return fp;
  }

  // ==========================================================
  _check() {
    if (!this._initialized) throw new Error('Fingerprint not initialized. Call generate() or restore() first.');
  }
}

module.exports = { Fingerprint };
