// ============================================================
// oas-fingerprint-sdk — Verifier
// ============================================================
// Verifier-side API. Scans particle clouds from camera or
// decoded media, creates challenges, verifies responses,
// and resolves agent lineage.
// ============================================================

const { ProtocolFraming, DEFAULTS } = require('../core/protocol');
const { DIDCrypto } = require('../core/did-crypto');

class Verifier {
  constructor(opts = {}) {
    this.framing = new ProtocolFraming(opts);
    this._pendingChallenges = new Map(); // nonce → challenge object
  }

  // ==========================================================
  // CAMERA SCANNING
  // ==========================================================

  /**
   * Create a camera scanner that reads particle fingerprints from video.
   * @param {HTMLVideoElement} videoElement - Camera feed
   * @param {object} opts - { onProgress?, onVerified?, onFailed?, onSync? }
   * @returns {CameraScanner} controller with start(), stop(), reset()
   */
  fromCamera(videoElement, opts = {}) {
    const { CameraScanner } = require('./camera-scanner');
    return new CameraScanner(videoElement, {
      framing: this.framing,
      ...opts,
    });
  }

  // ==========================================================
  // PAYLOAD VERIFICATION (direct)
  // ==========================================================

  /**
   * Verify a raw payload (e.g., received over network).
   * @param {Uint8Array} payload
   * @returns {Promise<{ valid, claim, publicKeyJwk, publicKeyMultibase, error? }>}
   */
  async verifyPayload(payload) {
    return DIDCrypto.verifyPayload(payload);
  }

  /**
   * Verify from encoded frames (e.g., decoded from GIF).
   * @param {number[][]} frames - Array of data bit arrays
   * @returns {Promise<{ valid, claim, publicKeyJwk, publicKeyMultibase, corrected, error? }>}
   */
  async verifyFrames(frames) {
    const decoded = this.framing.decode(frames);
    if (decoded.partial) {
      return { valid: false, error: 'Incomplete data', progress: decoded.progress };
    }
    if (decoded.errors) {
      return { valid: false, error: `Uncorrectable errors (${decoded.corrected} symbols corrected before failure)` };
    }
    const result = await DIDCrypto.verifyPayload(decoded.data);
    return { ...result, corrected: decoded.corrected };
  }

  // ==========================================================
  // CHALLENGE-RESPONSE (VERIFIER SIDE)
  // ==========================================================

  /**
   * Create a challenge for a target agent.
   * @param {string} targetDID - The DID of the agent to challenge
   * @param {number} ttlMs - Time-to-live in milliseconds (default 30s)
   * @returns {{ challenge: string, nonce: string, targetDID: string, createdAt, expiresAt }}
   */
  createChallenge(targetDID, ttlMs = DEFAULTS.challengeTTL) {
    const ch = DIDCrypto.createChallenge(targetDID, ttlMs);
    this._pendingChallenges.set(ch.nonce, ch);

    // Auto-expire
    setTimeout(() => this._pendingChallenges.delete(ch.nonce), ttlMs + 1000);

    return ch;
  }

  /**
   * Create a challenge and encode it as particle frames.
   * The verifier displays this animation; the target agent reads it.
   * @param {string} targetDID
   * @param {number} ttlMs
   * @returns {{ challenge, frames, totalFrames }}
   */
  createChallengeAnimation(targetDID, ttlMs = DEFAULTS.challengeTTL) {
    const ch = this.createChallenge(targetDID, ttlMs);
    const challengeBytes = new TextEncoder().encode(JSON.stringify(ch));
    const result = this.framing.encode(challengeBytes);
    return {
      challenge: ch,
      frames: result.frames,
      totalFrames: result.totalFrames,
    };
  }

  /**
   * Verify a challenge response payload.
   * @param {Uint8Array} responsePayload - The signed response from the agent
   * @param {string} nonce - The challenge nonce to verify against
   * @returns {Promise<{ valid, claim, publicKeyJwk, publicKeyMultibase, error? }>}
   */
  async verifyChallengeResponse(responsePayload, nonce) {
    const ch = this._pendingChallenges.get(nonce);
    if (!ch) return { valid: false, error: 'Unknown or expired challenge' };

    const result = await DIDCrypto.verifyChallengeResponse(responsePayload, ch);
    if (result.valid) {
      this._pendingChallenges.delete(nonce); // one-time use
    }
    return result;
  }

  /**
   * Verify a challenge response from decoded frames.
   * @param {number[][]} frames - Decoded frame bit arrays
   * @param {string} nonce
   */
  async verifyChallengeResponseFrames(frames, nonce) {
    const decoded = this.framing.decode(frames);
    if (decoded.partial) return { valid: false, error: 'Incomplete response' };
    if (decoded.errors) return { valid: false, error: 'Uncorrectable errors in response' };
    return this.verifyChallengeResponse(decoded.data, nonce);
  }

  // ==========================================================
  // LINEAGE RESOLUTION
  // ==========================================================

  /**
   * Resolve an agent's lineage chain.
   * Each link is a verifiable credential referencing a parent issuer.
   *
   * @param {string} did - Starting DID
   * @param {function} resolver - async (did) => { credential, parentDID? }
   *   User-provided function that resolves a DID to its credential and parent.
   * @param {number} maxDepth - Maximum chain depth (default 10)
   * @returns {Promise<Array<{ did, credential, depth }>>}
   */
  async resolveLineage(did, resolver, maxDepth = 10) {
    const chain = [];
    let current = did;
    let depth = 0;

    while (current && depth < maxDepth) {
      try {
        const result = await resolver(current);
        if (!result) break;
        chain.push({ did: current, credential: result.credential, depth });
        current = result.parentDID || null;
        depth++;
      } catch (e) {
        chain.push({ did: current, error: e.message, depth });
        break;
      }
    }

    return chain;
  }

  // ==========================================================
  // GIF DECODING
  // ==========================================================

  /**
   * Verify a fingerprint from an animated GIF.
   * @param {Uint8Array|ArrayBuffer} gifData
   * @returns {Promise<{ valid, claim, publicKeyJwk, publicKeyMultibase, corrected, error? }>}
   */
  async fromGIF(gifData) {
    const { GIFDecoder } = require('../export/gif-decoder');
    const frames = await GIFDecoder.decode(gifData, {
      gridSize: this.framing.gridSize,
      finderCells: this.framing.finderCells,
    });
    return this.verifyFrames(frames);
  }
}

module.exports = { Verifier };
