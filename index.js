// ============================================================
// oas-fingerprint-sdk
// ============================================================
// OpenAgent Fingerprint SDK
//
// A universal identity toolkit for autonomous agents.
// Encode DID credentials into animated particle clouds.
// Verify agent identity by scanning the visual fingerprint.
//
// Usage:
//
//   const { Fingerprint, Verifier } = require('oas-fingerprint-sdk');
//
//   // === PRESENTER (Agent proving identity) ===
//
//   const fp = await new Fingerprint().generate();
//   console.log(fp.did);                    // did:oas:l1fe:agent:bot
//   fp.toCanvas(canvasElement);             // live particle cloud
//   fp.toTerminal();                        // ANSI terminal rendering
//   const gif = await fp.toGIF();           // animated GIF for profiles
//   const png = await fp.toImage();         // still PNG for avatars
//   const keys = await fp.exportKeys();     // persist keys
//
//   // === VERIFIER (Checking another agent) ===
//
//   const v = new Verifier();
//
//   // Camera scanning
//   const scanner = v.fromCamera(videoElement, {
//     onVerified: (result) => console.log('Verified:', result.claim.issuer),
//     onProgress: (pct) => console.log(pct * 100 + '%'),
//   });
//   scanner.start();
//
//   // Challenge-response
//   const challenge = v.createChallenge('did:oas:l1fe:agent:target');
//   // ... send challenge.challenge to agent ...
//   const response = await targetFP.solveChallenge(challenge.challenge);
//   const result = await v.verifyChallengeResponse(response.payload, challenge.nonce);
//
//   // Direct payload verification
//   const result = await v.verifyPayload(payload);
//
//   // Lineage resolution
//   const chain = await v.resolveLineage(did, resolverFn);
//
// ============================================================

const { Fingerprint } = require('./src/presenter/fingerprint');
const { Verifier } = require('./src/verifier/verifier');
const { DIDCrypto } = require('./src/core/did-crypto');
const { ProtocolFraming, DEFAULTS } = require('./src/core/protocol');
const { ReedSolomon } = require('./src/core/reed-solomon');
const { ParticleSystem } = require('./src/renderers/particle-system');
const { CanvasRenderer } = require('./src/renderers/canvas-renderer');
const { TerminalRenderer } = require('./src/renderers/terminal-renderer');
const { CameraScanner } = require('./src/verifier/camera-scanner');
const { ImageExporter } = require('./src/export/image-exporter');

module.exports = {
  // Primary APIs
  Fingerprint,
  Verifier,

  // Core utilities (for advanced usage)
  DIDCrypto,
  ProtocolFraming,
  ReedSolomon,
  DEFAULTS,

  // Renderers (for custom integrations)
  ParticleSystem,
  CanvasRenderer,
  TerminalRenderer,
  CameraScanner,

  // Exporters
  ImageExporter,
};
