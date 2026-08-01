# oas-fingerprint-sdk

**OpenAgent Fingerprint** is the particle-based visual transport and verification layer for the **Open Agent Standard (OAS)**.

It does not replace the core OAS SDKs. The core OAS libraries remain responsible for `did:oas`, identity documents, lineage, attestation, and resolution. `oas-fingerprint-sdk` takes that identity model and makes it visible, camera-readable, challengeable, and portable across browser, terminal, GIF, and still-image surfaces without changing the particle aesthetic.

## What Is Built In

- `did:oas` identity generation with OAS namespace, kind, and identifier validation
- Ed25519 key generation and verification
- OAS credential envelopes with `https://openagent.id/ns/attestation/v1`
- `Ed25519Signature2020` proofs with multibase proof values
- `publicKeyMultibase` transport headers for self-contained verification
- Optional embedded OAS identity-document scaffold in the transmitted claim
- Reed-Solomon protected visual transport over the particle cloud

The animation, dust-cloud behavior, palette, and rendering effects remain the same. This migration is about OAS identity semantics and verification, not a visual redesign.

## Install

```bash
npm install oas-fingerprint-sdk
```

## Quick Start

```javascript
const { Fingerprint, Verifier } = require('oas-fingerprint-sdk');

const agent = await new Fingerprint().generate({
  namespace: 'l1fe',
  kind: 'agent',
  identifier: 'support-bot',
  platform: 'ops-console',
  subject: { role: 'support' },
});

console.log(agent.did);
// did:oas:l1fe:agent:support-bot

const verifier = new Verifier();
const result = await verifier.verifyPayload(agent.getPayload());

console.log(result.valid); // true
console.log(result.publicKeyMultibase); // z...
console.log(result.claim.proof.type); // Ed25519Signature2020
```

## Challenge-Response

```javascript
const { Fingerprint, Verifier } = require('oas-fingerprint-sdk');

const verifier = new Verifier();
const agent = await new Fingerprint().generate({
  namespace: 'l1fe',
  kind: 'agent',
  identifier: 'worker-01',
});

const challenge = verifier.createChallenge(agent.did, 30000);
const response = await agent.solveChallenge(challenge.challenge);
const proof = await verifier.verifyChallengeResponse(response.payload, challenge.nonce);

console.log(proof.valid); // true
console.log(proof.claim.type); // ['VerifiableCredential', 'LivenessAttestation']
```

## OAS Contract

### DID Shape

Generated identities use:

```text
did:oas:<namespace>:<kind>:<identifier>
```

Defaults:

- `namespace`: `openagent`
- `kind`: `agent`
- `identifier`: the Ed25519 public key encoded as multibase base58btc

### Proof Shape

Transmitted credentials use:

- `@context`: W3C VC + OAS attestation context
- `type`: `['VerifiableCredential', '<AttestationType>']`
- proof type: `Ed25519Signature2020`
- verification method: `<did>#key-1`
- proof value: multibase base58btc

### Storage vs Wire Format

`exportKeys()` still returns JWK material for convenient persistence:

```javascript
const exported = await agent.exportKeys();
// {
//   privateJwk,
//   publicJwk,
//   did,
//   publicKeyMultibase
// }
```

The **wire payload** is not JWK-first anymore. It is:

```text
[publicKeyMultibaseLen:2][publicKeyMultibase][claimLen:2][signedClaim]
```

That gives verifiers a self-contained Ed25519 verification path while keeping the signed credential OAS-native.

## API Highlights

### `new Fingerprint().generate(opts?)`

Generates a new OAS identity and particle transport payload.

```javascript
const fp = await new Fingerprint().generate({
  namespace: 'l1fe',
  kind: 'agent',
  identifier: 'scheduler',
  platform: 'control-plane',
  type: 'ConformanceAttestation',
  subject: { tier: 'prod' },
  name: 'Production Scheduler',
  description: 'Visual OAS transport identity for the scheduling agent',
});
```

Supported options:

- `namespace`
- `kind`
- `identifier`
- `platform`
- `type`
- `subject`
- `name`
- `description`
- `metadata`
- `service`

### `Fingerprint.fromJSON(json, opts?)`

Restores a fingerprint from exported JWK state while rebuilding the OAS payload and frames.

### `fp.getMeta()`

Returns transport metadata:

```javascript
{
  did: 'did:oas:l1fe:agent:scheduler',
  publicKeyHex: '...',
  publicKeyMultibase: 'z...',
  payloadBytes: 1147,
  totalFrames: 158,
  transmissionTime: 19.875,
  dataFps: 8,
  eccSymbols: 32,
  maxCorrectableErrors: 16
}
```

### `fp.solveChallenge(challengeString)`

Builds a signed OAS `LivenessAttestation` response and encodes it into payload bytes plus frames.

### `verifier.verifyPayload(payload)`

Returns:

```javascript
{
  valid,
  claim,
  publicKeyJwk,
  publicKeyMultibase,
  error
}
```

### `verifier.verifyFrames(frames)`

Decodes the frame stream, repairs Reed-Solomon errors when possible, and verifies the OAS proof.

### `verifier.createChallenge(targetDID, ttlMs?)`

Generates a nonce-bound challenge string for a target `did:oas` identity.

### `verifier.resolveLineage(did, resolver, maxDepth?)`

Walks from the fingerprinted DID toward its parent chain using a caller-provided resolver. This package does not replace OAS resolution; it provides the visual entry point into it.

## Rendering Surfaces

All renderers use the same underlying particle system and encoded frames:

- `fp.toCanvas(canvas, opts?)`
- `fp.toGIF(opts?)`
- `fp.toImage(opts?)`
- `fp.toTerminal(opts?)`

No OAS migration changes were made to the particle behavior itself.

## Protocol Notes

See [docs/PROTOCOL.md](./docs/PROTOCOL.md) for the transport specification.

Current reference parameters:

- Grid: 8×8 with 60 data cells and 4 finder cells
- Data rate: 60 bits/frame at 8 fps
- ECC: Reed-Solomon with 32 parity symbols
- Signature suite: Ed25519 / `Ed25519Signature2020`
- Payload profile: self-contained `publicKeyMultibase` + signed OAS credential
- Visual model: deterministic DID-seeded particle cloud

Because the payload now carries an OAS credential and proof instead of the older detached-signature format, current frame counts are higher than the earlier `did:key` draft. That is the expected tradeoff for correct OAS semantics. Future compaction can use DID references and external resolution where appropriate.

## Project Structure

```text
oas-fingerprint-sdk/
├── index.js
├── package.json
├── docs/
│   └── PROTOCOL.md
├── examples/
│   ├── encoder.html
│   └── verifier.html
├── src/
│   ├── core/
│   │   ├── did-crypto.js
│   │   ├── oas.js
│   │   ├── protocol.js
│   │   └── reed-solomon.js
│   ├── presenter/
│   │   └── fingerprint.js
│   ├── verifier/
│   │   ├── camera-scanner.js
│   │   └── verifier.js
│   ├── renderers/
│   │   ├── canvas-renderer.js
│   │   ├── particle-system.js
│   │   └── terminal-renderer.js
│   └── export/
│       ├── gif-exporter.js
│       └── image-exporter.js
└── test/
    └── test-all.js
```

## Position In The OAS Stack

- `oas/*`: canonical OAS DID, crypto, document, lineage, resolution, attestation
- `oas-glyph`: block-grid visual identity for `did:oas`
- `oas-fingerprint-sdk`: particle-based visual identity and challenge transport for `did:oas`
- `oas-voice`: acoustic identity and challenge transport for `did:oas`

All of these lower-level libraries should present the same OAS identity, not alternate identity systems.

## Contributing and Security

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development and pull-request
guidance. Report vulnerabilities privately according to
[SECURITY.md](./SECURITY.md).

## License

Licensed under the [MIT License](./LICENSE).
