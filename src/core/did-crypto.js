// ============================================================
// oas-fingerprint-sdk — OAS DID Crypto Utilities
// ============================================================
// Handles OAS DID creation, Ed25519 credential signing,
// verification, and challenge-response flows.
// ============================================================

const {
  OAS_ATTESTATION_CONTEXT,
  OAS_VERSION,
  DOCUMENT_PROOF_TYPE,
  createDid,
  defaultCredentialContexts,
  defaultDocumentContexts,
  bytesToHex,
  multibaseEncode,
  multibaseDecode,
  canonicalize,
} = require('./oas');

const ED25519_ALGO = { name: 'Ed25519' };

function getCrypto() {
  if (globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  return require('crypto').webcrypto;
}

function generateUUID() {
  const crypto = getCrypto();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseDid(did) {
  const parts = String(did).split(':');
  if (parts.length < 5 || parts[0] !== 'did' || parts[1] !== 'oas') {
    throw new Error(`Expected did:oas DID, got "${did}"`);
  }

  return {
    method: parts[1],
    namespace: parts[2],
    kind: parts.slice(3, -1).join(':'),
    identifier: parts[parts.length - 1],
  };
}

function stripProof(claim) {
  const copy = JSON.parse(JSON.stringify(claim));
  delete copy.proof;
  return copy;
}

function buildVerificationMethod(did, publicKeyMultibase) {
  return {
    id: `${did}#key-1`,
    type: 'Ed25519VerificationKey2020',
    controller: did,
    publicKeyMultibase,
  };
}

function buildIdentityDocument(did, publicKeyMultibase, opts = {}) {
  const { kind } = parseDid(did);
  const verificationMethod = buildVerificationMethod(did, publicKeyMultibase);

  return {
    '@context': defaultDocumentContexts(),
    id: did,
    controller: did,
    verificationMethod: [verificationMethod],
    authentication: [verificationMethod.id],
    assertionMethod: [verificationMethod.id],
    capabilityInvocation: [verificationMethod.id],
    capabilityDelegation: [verificationMethod.id],
    service: opts.service || [],
    oasVersion: OAS_VERSION,
    kind,
    name: opts.name,
    description: opts.description,
    metadata: {
      channel: 'visual-fingerprint',
      protocol: 'oas-fingerprint',
      ...(opts.metadata || {}),
    },
  };
}

class DIDCrypto {
  // ==========================================================
  // KEY MANAGEMENT
  // ==========================================================

  /**
   * Generate a new OAS DID key pair.
   * Returns { keyPair, did, publicKeyHex, publicKeyMultibase, publicKeyJwk, namespace, kind, identifier }
   */
  static async generateKeyPair(opts = {}) {
    const crypto = getCrypto();
    const keyPair = await crypto.subtle.generateKey(ED25519_ALGO, true, ['sign', 'verify']);
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const publicKeyHex = bytesToHex(publicKeyBytes);
    const publicKeyMultibase = multibaseEncode(publicKeyBytes);
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);

    const namespace = opts.namespace || 'openagent';
    const kind = opts.kind || 'agent';
    const identifier = opts.identifier || publicKeyMultibase;
    const did = createDid(namespace, kind, identifier);

    return {
      keyPair,
      did,
      publicKeyBytes,
      publicKeyHex,
      publicKeyMultibase,
      publicKeyJwk,
      namespace,
      kind,
      identifier,
    };
  }

  /** Import a public key from JWK for verification */
  static async importPublicKey(jwk) {
    const crypto = getCrypto();
    return crypto.subtle.importKey('jwk', jwk, ED25519_ALGO, true, ['verify']);
  }

  /** Import a public key from multibase raw bytes for verification */
  static async importPublicKeyMultibase(publicKeyMultibase) {
    const crypto = getCrypto();
    const publicKeyBytes = multibaseDecode(publicKeyMultibase);
    return crypto.subtle.importKey('raw', publicKeyBytes, ED25519_ALGO, true, ['verify']);
  }

  /** Export key pair for storage. Returns { privateJwk, publicJwk } */
  static async exportKeyPair(keyPair) {
    const crypto = getCrypto();
    const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    return { privateJwk, publicJwk };
  }

  /** Import key pair from stored JWKs */
  static async importKeyPair(privateJwk, publicJwk) {
    const crypto = getCrypto();
    const privateKey = await crypto.subtle.importKey('jwk', privateJwk, ED25519_ALGO, true, ['sign']);
    const publicKey = await crypto.subtle.importKey('jwk', publicJwk, ED25519_ALGO, true, ['verify']);
    return { privateKey, publicKey };
  }

  // ==========================================================
  // CREDENTIAL CREATION
  // ==========================================================

  /** Create an OAS verifiable credential claim */
  static createClaim(did, opts = {}) {
    const { kind } = parseDid(did);
    const verificationMethod = buildVerificationMethod(did, opts.publicKeyMultibase || '');
    const attestationType = opts.type || (opts.challenge ? 'LivenessAttestation' : 'ConformanceAttestation');

    const claim = {
      '@context': defaultCredentialContexts(),
      id: opts.id || `urn:uuid:${generateUUID()}`,
      type: ['VerifiableCredential', attestationType],
      issuer: did,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: did,
        kind,
        platform: opts.platform || 'oas-fingerprint',
        fingerprint: {
          channel: 'visual-particle',
          protocol: 'oas-fingerprint',
          oasVersion: OAS_VERSION,
        },
        verificationMethod,
        ...(kind === 'agent' || kind === 'agent:instance' ? { agent: true } : {}),
        ...(opts.subject || {}),
      },
      oas: {
        specVersion: OAS_VERSION,
        transport: 'visual',
        verificationContext: OAS_ATTESTATION_CONTEXT,
      },
    };

    if (opts.challenge) claim.challenge = opts.challenge;
    if (opts.expiresIn) {
      claim.expirationDate = new Date(Date.now() + opts.expiresIn).toISOString();
    }
    if (opts.name || opts.description || opts.metadata || opts.service) {
      claim.identityDocument = buildIdentityDocument(did, opts.publicKeyMultibase || '', {
        name: opts.name,
        description: opts.description,
        metadata: opts.metadata,
        service: opts.service,
      });
    }
    return claim;
  }

  /** Sign a claim with a private key. Returns { claim, claimBytes, signature } */
  static async signClaim(keyPair, claim) {
    const crypto = getCrypto();
    const unsignedClaim = stripProof(claim);
    const claimBytes = canonicalize(unsignedClaim);
    const signature = new Uint8Array(await crypto.subtle.sign(ED25519_ALGO, keyPair.privateKey, claimBytes));
    const signedClaim = {
      ...unsignedClaim,
      proof: {
        type: DOCUMENT_PROOF_TYPE,
        created: new Date().toISOString(),
        verificationMethod: `${claim.issuer}#key-1`,
        proofPurpose: 'assertionMethod',
        proofValue: multibaseEncode(signature),
      },
    };

    return {
      claim: signedClaim,
      claimBytes: new TextEncoder().encode(JSON.stringify(signedClaim)),
      signature,
    };
  }

  // ==========================================================
  // PAYLOAD BUILDING
  // ==========================================================

  /**
   * Build the full transmission payload.
   * Format: [publicKeyMultibaseLen:2][publicKeyMultibase][claimLen:2][signedClaim]
   */
  static buildPayload(publicKeyMultibase, claimBytes) {
    const pkBytes = new TextEncoder().encode(publicKeyMultibase);
    const full = new Uint8Array(2 + pkBytes.length + 2 + claimBytes.length);
    full[0] = (pkBytes.length >> 8) & 0xff;
    full[1] = pkBytes.length & 0xff;
    full.set(pkBytes, 2);
    full[2 + pkBytes.length] = (claimBytes.length >> 8) & 0xff;
    full[3 + pkBytes.length] = claimBytes.length & 0xff;
    full.set(claimBytes, 4 + pkBytes.length);
    return full;
  }

  // ==========================================================
  // VERIFICATION
  // ==========================================================

  /** Parse and verify a received payload. Returns { valid, claim, publicKeyJwk, publicKeyMultibase, error? } */
  static async verifyPayload(payload) {
    try {
      const crypto = getCrypto();
      const pkLen = (payload[0] << 8) | payload[1];
      const publicKeyMultibase = new TextDecoder().decode(payload.slice(2, 2 + pkLen));
      const rest = payload.slice(2 + pkLen);
      const claimLen = (rest[0] << 8) | rest[1];
      const claimBytes = rest.slice(2, 2 + claimLen);
      const claim = JSON.parse(new TextDecoder().decode(claimBytes));

      if (!claim.proof || claim.proof.type !== DOCUMENT_PROOF_TYPE) {
        return { valid: false, error: 'Missing or unsupported proof type' };
      }

      const publicKey = await this.importPublicKeyMultibase(publicKeyMultibase);
      const publicKeyJwk = await crypto.subtle.exportKey('jwk', publicKey);
      const canonicalBytes = canonicalize(stripProof(claim));
      const signatureBytes = multibaseDecode(claim.proof.proofValue);
      const valid = await crypto.subtle.verify(ED25519_ALGO, publicKey, signatureBytes, canonicalBytes);

      if (!valid) {
        return { valid: false, claim, publicKeyJwk, publicKeyMultibase, error: 'Invalid proof signature' };
      }

      if (claim.expirationDate && new Date(claim.expirationDate) < new Date()) {
        return { valid: false, claim, publicKeyJwk, publicKeyMultibase, error: 'Credential expired' };
      }

      const subjectDid = claim.credentialSubject && claim.credentialSubject.id;
      if (subjectDid && subjectDid !== claim.issuer) {
        return {
          valid: false,
          claim,
          publicKeyJwk,
          publicKeyMultibase,
          error: 'Issuer and credential subject DID mismatch',
        };
      }

      return { valid: true, claim, publicKeyJwk, publicKeyMultibase };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  // ==========================================================
  // CHALLENGE-RESPONSE
  // ==========================================================

  /** Generate a challenge for a target DID. Returns { challenge, nonce, targetDID, createdAt, expiresAt } */
  static createChallenge(targetDID, ttlMs = 30000) {
    const crypto = getCrypto();
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    return {
      challenge: `oas:challenge:${targetDID}:${nonce}:${now}`,
      nonce,
      targetDID,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
  }

  /** Solve a challenge by signing it. Returns the full payload with challenge embedded. */
  static async solveChallenge(keyPair, did, publicKeyMultibase, challengeString) {
    const claim = this.createClaim(did, {
      publicKeyMultibase,
      challenge: challengeString,
      type: 'LivenessAttestation',
    });
    const { claimBytes } = await this.signClaim(keyPair, claim);
    return this.buildPayload(publicKeyMultibase, claimBytes);
  }

  /** Verify a challenge response. Checks signature AND challenge match. */
  static async verifyChallengeResponse(payload, expectedChallenge) {
    const result = await this.verifyPayload(payload);
    if (!result.valid) return result;

    if (!result.claim.challenge || result.claim.challenge !== expectedChallenge.challenge) {
      return { ...result, valid: false, error: 'Challenge mismatch' };
    }

    if (Date.now() > expectedChallenge.expiresAt) {
      return { ...result, valid: false, error: 'Challenge expired' };
    }

    if (result.claim.issuer !== expectedChallenge.targetDID) {
      return { ...result, valid: false, error: 'DID mismatch — response from wrong agent' };
    }

    return result;
  }
}

module.exports = { DIDCrypto };
