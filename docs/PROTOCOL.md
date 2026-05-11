# OpenAgent Fingerprint Protocol Specification

**Version:** 0.1.0-draft
**Status:** Working Draft
**Date:** 2026-03-13

---

## 1. Overview

The OpenAgent Fingerprint Protocol encodes **OAS** identity credentials into animated particle density patterns that can be captured and verified by a camera. The protocol enables visual identity verification for autonomous agents, organizations, and services without requiring static barcodes or QR codes.

The visual presentation is a three-dimensional particle cloud — thousands of micro-luminous particles swirling in a spherical formation. Data is encoded invisibly by modulating particle density across spatial grid cells. A verifier captures the animation via camera, decodes the density pattern frame-by-frame, reconstructs the payload, and cryptographically verifies the embedded credential.

### 1.1 Design Goals

- **Visual-first identity:** The particle cloud is the primary interface. It should be beautiful and organic, not mechanical.
- **Camera-scannable:** A standard smartphone camera at 30fps must be able to decode the signal.
- **Cryptographically sound:** `did:oas` credentials with Ed25519 proofs, replay prevention, and chain-of-trust resolution.
- **Error-resilient:** Reed-Solomon error correction tolerates noisy camera captures, partial occlusion, and screen glare.
- **Transport-agnostic:** The encoding scheme works over any visual channel — browser canvas, terminal block characters, LED matrix, or projected display.

### 1.2 Terminology

| Term | Definition |
|------|-----------|
| **Badge** | The encoded particle cloud animation displayed by an agent or entity |
| **Verifier** | A camera-equipped device that captures and decodes a badge |
| **Cell** | A spatial region within the encoding grid |
| **Finder cell** | A cell that is always "on" (bright), used for grid detection and orientation |
| **Data cell** | A cell whose brightness represents a binary value |
| **Sync frame** | A known checkerboard pattern marking the start of a transmission cycle |
| **Data frame** | A frame carrying payload bits via cell density modulation |

---

## 2. Encoding Grid

### 2.1 Grid Geometry

The encoding grid is an 8×8 matrix of cells overlaid on the particle cloud's bounding area.

- **Grid size:** 8 × 8 = 64 cells
- **Finder cells:** 4 (grid corners at positions 0, 7, 56, 63)
- **Data cells:** 60 (all non-finder cells)
- **Bits per data frame:** 60

Cell indices are numbered row-major, left-to-right, top-to-bottom:

```
 F  .  .  .  .  .  .  F      F = Finder cell (always on)
 .  .  .  .  .  .  .  .      . = Data cell
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
 .  .  .  .  .  .  .  .
 F  .  .  .  .  .  .  F
```

### 2.2 Density Encoding

Each data cell encodes a single bit per frame:

- **Bit 1 (bright):** Particles cluster densely in the cell's region, creating visible luminosity
- **Bit 0 (dark):** Particles disperse to cell edges or reduce in opacity, creating a dim region

The transition between states is smoothed over ~100ms to maintain organic visual motion. The density modulation is invisible to casual observation — the cloud appears to swirl naturally.

### 2.3 Finder Cell Behavior

Finder cells are always in the "bright" state. They serve as:

1. **Grid detection:** The verifier locates four bright corners to identify the grid bounds
2. **Perspective correction:** Four known points enable homography transformation
3. **Brightness reference:** Finder cells establish the "bright" baseline for adaptive thresholding

---

## 3. Frame Protocol

### 3.1 Frame Sequence

A complete transmission cycle consists of:

```
[SYNC] [DATA_0] [DATA_1] ... [DATA_N-1] [SYNC] [DATA_0] ...
```

The cycle repeats indefinitely. A verifier can begin capture at any point and wait for a sync frame to begin decoding.

### 3.2 Sync Frame

The sync frame uses a **checkerboard pattern** across all data cells:

```
 F  0  1  0  1  0  1  F
 1  0  1  0  1  0  1  0
 0  1  0  1  0  1  0  1
 1  0  1  0  1  0  1  0
 0  1  0  1  0  1  0  1
 1  0  1  0  1  0  1  0
 0  1  0  1  0  1  0  1
 F  0  1  0  1  0  1  F
```

Detection threshold: a frame is classified as sync if ≥78% of data cells match the expected checkerboard. This tolerance accommodates camera noise.

### 3.3 Data Rate

- **Data frame rate:** 8 frames per second
- **Bits per frame:** 60 (data cells)
- **Raw throughput:** 480 bits/second = 60 bytes/second
- **Effective throughput (with RS overhead):** ~38 bytes/second (with RS(32))

### 3.4 Data Frame Layout

Each data frame carries 60 bits mapped from the payload bit stream. Cell-to-bit mapping skips finder cells:

```
Cell index:  0  1  2  3  4  5  6  7  8  9 10 ... 63
Data index:  F  0  1  2  3  4  5  F  6  7  8 ... F
```

Where `F` = finder (always 1), and numeric indices map to sequential payload bits.

---

## 4. Payload Structure

### 4.1 Bit Stream Header

The first 32 bits of the data stream (across the first frame(s)) contain two 16-bit length fields:

| Bits | Field | Description |
|------|-------|-------------|
| 0-15 | `origLen` | Original payload length in bytes (before RS encoding) |
| 16-31 | `encLen` | RS-encoded payload length in bytes |

### 4.2 Encoded Data

Following the header, `encLen × 8` bits contain the Reed-Solomon encoded payload, MSB first.

### 4.3 Padding

The bit stream is zero-padded to the nearest multiple of 60 (data cells per frame).

---

## 5. Error Correction

### 5.1 Reed-Solomon Parameters

| Parameter | Value |
|-----------|-------|
| Field | GF(2^8) |
| Primitive polynomial | 0x11d (x^8 + x^4 + x^3 + x^2 + 1) |
| ECC symbols | 32 (configurable) |
| Max correctable errors | 16 byte errors per payload |
| Max correctable erasures | 32 (if positions known) |

### 5.2 Encoding Convention

Polynomials use ascending degree (index = degree). The codeword format is:

```
[ECC_0 ... ECC_31] [DATA_0 ... DATA_N-1]
```

ECC symbols are prepended to the data. The generator polynomial is:

```
G(x) = ∏(x - α^i) for i = 0, 1, ..., nsym-1
```

---

## 6. DID Credential Payload

### 6.1 Payload Format

The raw payload (before RS encoding) contains:

```text
[publicKeyMultibaseLen: 2 bytes] [publicKeyMultibase: UTF-8] [claimLen: 2 bytes] [signedClaim: JSON]
```

The wire payload is self-contained for verification, but OAS-native in structure.

### 6.2 Public Key

The signer's public key is carried as `publicKeyMultibase` using base58btc multibase with the `z` prefix. This matches OAS identity documents and `Ed25519VerificationKey2020` verification methods.

### 6.3 Verifiable Claim

The signed claim is an OAS-flavored W3C Verifiable Credential:

```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://openagent.id/ns/attestation/v1"
  ],
  "id": "urn:uuid:...",
  "type": ["VerifiableCredential", "ConformanceAttestation"],
  "issuer": "did:oas:l1fe:agent:support-bot",
  "issuanceDate": "2026-03-13T...",
  "credentialSubject": {
    "id": "did:oas:l1fe:agent:support-bot",
    "kind": "agent",
    "agent": true,
    "platform": "oas-fingerprint",
    "fingerprint": {
      "channel": "visual-particle",
      "protocol": "oas-fingerprint",
      "oasVersion": "1.0.0"
    },
    "verificationMethod": {
      "id": "did:oas:l1fe:agent:support-bot#key-1",
      "type": "Ed25519VerificationKey2020",
      "controller": "did:oas:l1fe:agent:support-bot",
      "publicKeyMultibase": "z..."
    }
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-03-13T...",
    "verificationMethod": "did:oas:l1fe:agent:support-bot#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z..."
  }
}
```

### 6.4 Signature

The claim is canonicalized with JSON Canonicalization Scheme semantics, signed with **Ed25519**, and stored in the credential proof as `proofValue` (multibase base58btc). Verification reconstructs the unsigned credential, re-canonicalizes it, and checks the Ed25519 signature against the transmitted `publicKeyMultibase`.

### 6.5 Challenge-Response Flow

For active verification (reverse-authentication):

1. Verifier generates a random nonce (challenge)
2. Verifier transmits challenge to the agent (out-of-band or via a reverse particle channel)
3. Agent includes the challenge in the claim's `challenge` field
4. Agent signs and broadcasts the particle badge
5. Verifier captures, decodes, checks signature AND challenge match

This prevents replay attacks — a recorded badge cannot be reused.

---

## 7. Visual Rendering

### 7.1 Particle Cloud Specification

The reference renderer uses the following parameters:

| Parameter | Value |
|-----------|-------|
| Particle count | 4,000 - 6,000 |
| Particle size | 0.2 - 1.2px (screen-relative) |
| Distribution | Spherical shell with interior bias |
| Orbit | Per-particle theta/phi with swirl velocity |
| Breathing | Sinusoidal radius oscillation (±4%, 0.35Hz) |
| Color range | HSL hue 152-196 (green to cyan) |
| Glow | Radial gradient per particle, 3-4× core size |

### 7.2 State Transitions

The particle cloud's visual state communicates protocol status:

| State | Color | Motion | Purpose |
|-------|-------|--------|---------|
| Idle | Cool cyan (H:185) | Gentle swirl | No active scan |
| Broadcasting | Green-cyan (H:160) | Steady orbit | Transmitting badge |
| Scanning | Warm amber (H:38) | Faster swirl | Verifier is capturing |
| Verified | Bright green (H:157) | Expanded, slow | Signature valid |
| Failed | Red (H:0) | Contracted, agitated | Verification failed |

### 7.3 Density Modulation

When a cell's state is 0 (dark):
- Particles in that cell region scatter to edges
- Opacity reduces to ~4% of base
- Core white specks are suppressed

When a cell's state is 1 (bright):
- Particles cluster toward cell center
- Full opacity and glow
- Core specks visible

Transitions are lerped at rate 0.12 per frame to avoid abrupt visual changes.

---

## 8. Verifier Pipeline

### 8.1 Capture

1. Open rear camera at ≥30fps, 640×640 minimum resolution
2. Identify potential badge region via finder cell brightness clustering
3. Apply perspective correction using 4 finder points

### 8.2 Grid Detection

1. Locate four bright regions in a roughly rectangular arrangement
2. Compute homography matrix from detected corners to canonical 8×8 grid
3. Warp frame to align grid

### 8.3 Bit Extraction

1. For each data cell, compute mean brightness in inner 60% region
2. Weight green/cyan channel higher (0.2R + 0.6G + 0.2B)
3. Use finder cell brightness as "known 1" reference
4. Adaptive threshold: data cell brightness > median → 1, else → 0

### 8.4 Frame Classification

1. Check if current frame matches sync pattern (≥78% match)
2. If sync: mark frame boundary, reset data accumulator
3. If data: extract 60 data bits, append to accumulator

### 8.5 Payload Reconstruction

1. After accumulating sufficient frames, read 32-bit header
2. Continue until `encLen × 8` data bits received
3. RS-decode the byte stream
4. Parse payload and verify signature

---

## 9. Future Extensions

### 9.1 Terminal Transport

For headless agents, the particle cloud can be rendered as Unicode block characters in a terminal. The encoding grid maps to character cells using block elements (▀▁▂▃▄▅▆▇█) for brightness levels. The agent captures the terminal output programmatically.

### 9.2 Lineage Resolution

The verifier can resolve an agent's full trust chain:

```
Agent DID → Creator DID → Organization DID → Root Authority
```

Each link is a verifiable credential referencing the parent issuer. The OpenAgent app displays this as a visual lineage tree.

### 9.3 Multi-Modal Challenge

The challenge can be transmitted via:
- Reverse particle channel (verifier displays challenge, agent reads it)
- Audio tone encoding
- NFC tap
- QR code (ironically)

### 9.4 Larger Grids

For higher data rates, the grid can scale to 12×12 (128 data cells + 16 finders) or 16×16 (240 data cells + 16 finders), increasing throughput proportionally.

---

## 10. Reference Implementation

### 10.1 Core Library

`oas-fingerprint-sdk.js` — Protocol encoding, Reed-Solomon, DID crypto utilities. Platform-agnostic JavaScript, runs in browser and Node.js.

### 10.2 Encoder (Agent Badge)

`oas-fingerprint-encoder.html` — Browser-based particle cloud renderer. Generates DID credentials and broadcasts via animated particle density modulation.

### 10.3 Verifier (OpenAgent)

`oas-fingerprint-verifier.html` — Browser-based camera scanner with particle cloud visual feedback. Decodes and verifies DID credentials.

### 10.4 OpenAgent Mobile App

React Native application for iOS and Android. Camera-based badge scanning with lineage resolution and agent/org explorer.

---

*This specification is a working draft. Protocol parameters may change as camera scanning is validated across devices.*
