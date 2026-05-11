// ============================================================
// oas-fingerprint-sdk — OAS Identity Helpers
// ============================================================
// Minimal local implementation of the OAS identity primitives
// this package needs: DID validation/building, multibase public
// key encoding, and JSON canonicalization for Ed25519 proofs.
// ============================================================

const VC_CONTEXT = 'https://www.w3.org/2018/credentials/v1';
const DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
const ED25519_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';
const OAS_CONTEXT = 'https://openagent.id/ns/oas/v1';
const OAS_ATTESTATION_CONTEXT = 'https://openagent.id/ns/attestation/v1';
const OAS_VERSION = '1.0.0';
const DOCUMENT_PROOF_TYPE = 'Ed25519Signature2020';
const RESERVED_NAMESPACES = new Set(['oas', 'test', 'example']);
const ENTITY_KINDS = new Set([
  'hmr',
  'mhr',
  'enr',
  'ao',
  'agent',
  'agent:instance',
  'tool',
  'skill',
  'workflow',
  'model',
  'dataset',
  'service',
]);

function validateNamespace(namespace) {
  if (typeof namespace !== 'string' || namespace.length === 0) {
    throw new Error('OAS namespace must not be empty');
  }
  if (namespace.length > 63) {
    throw new Error(`OAS namespace must be at most 63 characters, got ${namespace.length}`);
  }
  if (namespace.startsWith('-') || namespace.endsWith('-')) {
    throw new Error('OAS namespace must not begin or end with a hyphen');
  }
  if (!/^[a-z0-9-]+$/.test(namespace)) {
    throw new Error('OAS namespace must use lowercase alphanumeric characters and hyphens only');
  }
  if (RESERVED_NAMESPACES.has(namespace)) {
    throw new Error(`Reserved namespace "${namespace}" is not allowed in OAS DIDs`);
  }
}

function validateIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new Error('OAS identifier must not be empty');
  }
  if (identifier.length > 128) {
    throw new Error(`OAS identifier must be at most 128 characters, got ${identifier.length}`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(identifier)) {
    throw new Error("OAS identifier may only contain alphanumeric characters, '.', '_', and '-'");
  }
}

function validateKind(kind) {
  if (!ENTITY_KINDS.has(kind)) {
    throw new Error(`Unknown OAS kind "${kind}"`);
  }
}

function createDid(namespace, kind, identifier) {
  validateNamespace(namespace);
  validateKind(kind);
  validateIdentifier(identifier);
  return `did:oas:${namespace}:${kind}:${identifier}`;
}

function defaultCredentialContexts() {
  return [VC_CONTEXT, OAS_ATTESTATION_CONTEXT];
}

function defaultDocumentContexts() {
  return [DID_CONTEXT, ED25519_CONTEXT, OAS_CONTEXT];
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Int32Array(256).fill(-1);
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP[BASE58_ALPHABET.charCodeAt(i)] = i;
}

function base58btcEncode(bytes) {
  if (bytes.length === 0) return '';

  let leadingZeros = 0;
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) {
    leadingZeros++;
  }

  const size = ((bytes.length - leadingZeros) * 138 / 100 + 1) | 0;
  const b58 = new Uint8Array(size);

  let length = 0;
  for (let i = leadingZeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = 0;
    for (let k = size - 1; k >= 0; k--) {
      if (carry === 0 && j >= length) break;
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
      j++;
    }
    length = j;
  }

  let start = size - length;
  while (start < size && b58[start] === 0) {
    start++;
  }

  let result = '';
  for (let i = 0; i < leadingZeros; i++) {
    result += '1';
  }
  for (let i = start; i < size; i++) {
    result += BASE58_ALPHABET[b58[i]];
  }
  return result;
}

function base58btcDecode(str) {
  if (str.length === 0) return new Uint8Array(0);

  let leadingOnes = 0;
  while (leadingOnes < str.length && str[leadingOnes] === '1') {
    leadingOnes++;
  }

  const size = ((str.length - leadingOnes) * 733 / 1000 + 1) | 0;
  const b256 = new Uint8Array(size);

  let length = 0;
  for (let i = leadingOnes; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    let carry = charCode < 256 ? BASE58_MAP[charCode] : -1;
    if (carry === -1) {
      throw new Error(`Invalid base58btc character "${str[i]}" at position ${i}`);
    }

    let j = 0;
    for (let k = size - 1; k >= 0; k--) {
      if (carry === 0 && j >= length) break;
      carry += 58 * b256[k];
      b256[k] = carry % 256;
      carry = (carry / 256) | 0;
      j++;
    }
    length = j;
  }

  const start = size - length;
  const result = new Uint8Array(leadingOnes + (size - start));
  for (let i = 0; i < size - start; i++) {
    result[leadingOnes + i] = b256[start + i];
  }
  return result;
}

function multibaseEncode(bytes) {
  return 'z' + base58btcEncode(bytes);
}

function multibaseDecode(encoded) {
  if (typeof encoded !== 'string' || encoded[0] !== 'z') {
    throw new Error(`Expected base58btc multibase string with "z" prefix, got "${encoded || ''}"`);
  }
  return base58btcDecode(encoded.slice(1));
}

function canonicalize(value) {
  return new TextEncoder().encode(canonicalizeValue(value));
}

function canonicalizeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return undefined;

  const type = typeof value;
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('JCS does not support Infinity or NaN');
    }
    return JSON.stringify(value);
  }
  if (type === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = [];
    for (const item of value) {
      const serialized = canonicalizeValue(item);
      items.push(serialized === undefined ? 'null' : serialized);
    }
    return '[' + items.join(',') + ']';
  }

  if (type === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = [];
    for (const key of keys) {
      const serialized = canonicalizeValue(value[key]);
      if (serialized !== undefined) {
        pairs.push(JSON.stringify(key) + ':' + serialized);
      }
    }
    return '{' + pairs.join(',') + '}';
  }

  throw new Error(`JCS does not support values of type "${type}"`);
}

module.exports = {
  VC_CONTEXT,
  DID_CONTEXT,
  ED25519_CONTEXT,
  OAS_CONTEXT,
  OAS_ATTESTATION_CONTEXT,
  OAS_VERSION,
  DOCUMENT_PROOF_TYPE,
  ENTITY_KINDS,
  RESERVED_NAMESPACES,
  validateNamespace,
  validateIdentifier,
  validateKind,
  createDid,
  defaultCredentialContexts,
  defaultDocumentContexts,
  bytesToHex,
  base58btcEncode,
  base58btcDecode,
  multibaseEncode,
  multibaseDecode,
  canonicalize,
};
