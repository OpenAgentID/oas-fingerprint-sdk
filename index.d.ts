// ============================================================
// oas-fingerprint-sdk — TypeScript Type Declarations
// ============================================================
// Generated for v0.1.0. Matches the runtime exports in index.js.
// ============================================================

// ─── Core Types ───────────────────────────────────────────

export interface GenerateOptions {
  namespace?: string;
  kind?: string;
  identifier?: string;
  platform?: string;
  subject?: Record<string, unknown>;
  type?: string;
  name?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
}

export interface ExportedKeys {
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
  did: string;
  publicKeyMultibase: string;
}

export interface TransmissionMeta {
  did: string;
  publicKeyHex: string;
  publicKeyMultibase: string;
  payloadBytes: number;
  totalFrames: number;
  transmissionTime: number;
  dataFps: number;
  eccSymbols: number;
  maxCorrectableErrors: number;
}

export interface FrameData {
  frames: number[][];
  totalFrames: number;
}

export interface ChallengeResponse {
  payload: Uint8Array;
  frames: number[][];
  totalFrames: number;
}

export interface VerificationResult {
  valid: boolean;
  claim?: OASClaim;
  publicKeyJwk?: JsonWebKey;
  publicKeyMultibase?: string;
  corrected?: number;
  error?: string;
  progress?: number;
}

export interface OASClaim {
  '@context': string[];
  type: string[];
  issuer: string;
  issuanceDate: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  proof?: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
  [key: string]: unknown;
}

export interface ChallengeInfo {
  challenge: string;
  nonce: string;
  targetDID: string;
  createdAt: number;
  expiresAt: number;
}

export interface ChallengeAnimation {
  challenge: ChallengeInfo;
  frames: number[][];
  totalFrames: number;
}

export interface LineageLink {
  did: string;
  credential?: OASClaim;
  error?: string;
  depth: number;
}

export type LineageResolver = (did: string) => Promise<{
  credential: OASClaim;
  parentDID?: string;
} | null>;

// ─── Fingerprint (Presenter) ──────────────────────────────

export class Fingerprint {
  keyPair: CryptoKeyPair | null;
  did: string | null;
  publicKeyHex: string | null;
  publicKeyMultibase: string | null;
  publicKeyJwk: JsonWebKey | null;
  payload: Uint8Array | null;
  frames: number[][] | null;
  totalFrames: number;

  constructor();

  /** Generate a new fingerprint identity. */
  generate(opts?: GenerateOptions): Promise<this>;

  /** Restore from stored keys. */
  restore(privateJwk: JsonWebKey, publicJwk: JsonWebKey, did: string, opts?: GenerateOptions): Promise<this>;

  /** Export keys for persistent storage. */
  exportKeys(): Promise<ExportedKeys>;

  /** Get the raw payload bytes. */
  getPayload(): Uint8Array;

  /** Get encoded frames. */
  getFrames(): FrameData;

  /** Get transmission metadata. */
  getMeta(): TransmissionMeta;

  /** Solve a challenge from a verifier. */
  solveChallenge(challengeString: string): Promise<ChallengeResponse>;

  /** Render live particle cloud into a canvas element. */
  toCanvas(canvas: HTMLCanvasElement, opts?: CanvasRenderOptions): CanvasRenderer;

  /** Export an animated GIF. */
  toGIF(opts?: GIFExportOptions): Promise<Uint8Array>;

  /** Export a still PNG. */
  toImage(opts?: ImageExportOptions): Promise<Uint8Array>;

  /** Render to terminal as animated ANSI/Unicode. */
  toTerminal(opts?: TerminalRenderOptions): TerminalRenderer;

  /** Serialize to JSON (includes keys). */
  toJSON(): Promise<ExportedKeys & { publicKeyHex: string; publicKeyMultibase: string; version: string }>;

  /** Restore from serialized JSON. */
  static fromJSON(json: ExportedKeys & { publicKeyHex?: string }, opts?: GenerateOptions): Promise<Fingerprint>;
}

// ─── Verifier ─────────────────────────────────────────────

export class Verifier {
  constructor(opts?: ProtocolOptions);

  /** Create a camera scanner. */
  fromCamera(videoElement: HTMLVideoElement, opts?: CameraScannerOptions): CameraScanner;

  /** Verify a raw payload. */
  verifyPayload(payload: Uint8Array): Promise<VerificationResult>;

  /** Verify from encoded frames. */
  verifyFrames(frames: number[][]): Promise<VerificationResult>;

  /** Create a challenge for a target agent. */
  createChallenge(targetDID: string, ttlMs?: number): ChallengeInfo;

  /** Create a challenge encoded as particle frames. */
  createChallengeAnimation(targetDID: string, ttlMs?: number): ChallengeAnimation;

  /** Verify a challenge response payload. */
  verifyChallengeResponse(responsePayload: Uint8Array, nonce: string): Promise<VerificationResult>;

  /** Verify a challenge response from decoded frames. */
  verifyChallengeResponseFrames(frames: number[][], nonce: string): Promise<VerificationResult>;

  /** Resolve an agent's lineage chain. */
  resolveLineage(did: string, resolver: LineageResolver, maxDepth?: number): Promise<LineageLink[]>;

  /** Verify a fingerprint from an animated GIF. */
  fromGIF(gifData: Uint8Array | ArrayBuffer): Promise<VerificationResult>;
}

// ─── DIDCrypto ────────────────────────────────────────────

export class DIDCrypto {
  static generateKeyPair(opts?: GenerateOptions): Promise<{
    keyPair: CryptoKeyPair;
    did: string;
    publicKeyHex: string;
    publicKeyMultibase: string;
    publicKeyJwk: JsonWebKey;
  }>;

  static importKeyPair(privateJwk: JsonWebKey, publicJwk: JsonWebKey): Promise<CryptoKeyPair>;

  static exportKeyPair(keyPair: CryptoKeyPair): Promise<{
    privateJwk: JsonWebKey;
    publicJwk: JsonWebKey;
  }>;

  static createClaim(did: string, opts?: {
    platform?: string;
    subject?: Record<string, unknown>;
    type?: string;
    publicKeyMultibase?: string;
    name?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
  }): OASClaim;

  static signClaim(keyPair: CryptoKeyPair, claim: OASClaim): Promise<{
    signedClaim: OASClaim;
    claimBytes: Uint8Array;
  }>;

  static verifyPayload(payload: Uint8Array): Promise<VerificationResult>;

  static buildPayload(publicKeyMultibase: string, claimBytes: Uint8Array): Uint8Array;

  static createChallenge(targetDID: string, ttlMs?: number): ChallengeInfo;

  static solveChallenge(
    keyPair: CryptoKeyPair,
    did: string,
    publicKeyMultibase: string,
    challengeString: string,
  ): Promise<Uint8Array>;

  static verifyChallengeResponse(
    payload: Uint8Array,
    challenge: ChallengeInfo,
  ): Promise<VerificationResult>;
}

// ─── ProtocolFraming ──────────────────────────────────────

export interface ProtocolOptions {
  gridSize?: number;
  finderCells?: number[];
  dataCells?: number;
  dataFps?: number;
  eccSymbols?: number;
  syncThreshold?: number;
}

export interface DecodeResult {
  data: Uint8Array | null;
  partial: boolean;
  progress: number;
  corrected?: number;
  errors?: boolean;
  origLen?: number;
  encLen?: number;
}

export class ProtocolFraming {
  gridSize: number;
  finderCells: number[];
  dataCells: number;
  dataFps: number;
  rs: ReedSolomon;
  syncThreshold: number;
  cellToData: number[];

  constructor(opts?: ProtocolOptions);
  encode(payload: Uint8Array): { frames: number[][]; totalFrames: number; encodedLength: number };
  decode(frames: number[][]): DecodeResult;
  syncFrame(): number[];
  isSyncFrame(bits: number[]): boolean;
  extractData(bits: number[]): number[];
  dataToCells(dataBits: number[]): number[];
  transmissionTime(payloadBytes: number): number;
}

export const DEFAULTS: {
  gridSize: 8;
  finderCells: number[];
  dataCells: 60;
  dataFps: 8;
  eccSymbols: 32;
  syncThreshold: 0.78;
  particleCount: 5000;
  orbRadiusFactor: 0.21;
  hueRange: [152, 196];
  challengeTTL: 30000;
};

// ─── ReedSolomon ──────────────────────────────────────────

export class ReedSolomon {
  nsym: number;
  constructor(nsym?: number);
  encode(data: Uint8Array): Uint8Array;
  decode(received: Uint8Array): { data: Uint8Array; corrected: number; errors: boolean };
}

// ─── ParticleSystem ───────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  hue: number;
  saturation: number;
  phase: number;
  driftX: number;
  driftY: number;
  theta: number;
  phi: number;
  swirlSpeed: number;
  orbitRadius: number;
}

export interface ParticleSystemOptions {
  count?: number;
  hueRange?: [number, number];
  seed?: string;
  orbRadiusFactor?: number;
}

export class ParticleSystem {
  particles: Particle[];
  constructor(opts?: ParticleSystemOptions);
  update(t: number, opts?: { breathe?: number; swirl?: number; radius?: number }): void;
  sorted(opts?: { cameraZ?: number }): Particle[];
}

// ─── CanvasRenderer ───────────────────────────────────────

export interface CanvasRenderOptions {
  width?: number;
  height?: number;
  background?: string;
}

export class CanvasRenderer {
  constructor(canvas: HTMLCanvasElement, opts: CanvasRenderOptions & {
    frames: number[][];
    totalFrames: number;
    finderCells: number[];
    gridSize: number;
    dataFps: number;
  });
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  toggleDebug(): void;
}

// ─── TerminalRenderer ─────────────────────────────────────

export interface TerminalRenderOptions {
  stream?: NodeJS.WritableStream;
  width?: number;
  fps?: number;
}

export class TerminalRenderer {
  constructor(opts: TerminalRenderOptions & {
    frames: number[][];
    totalFrames: number;
    finderCells: number[];
    gridSize: number;
    dataFps: number;
    did: string;
  });
  start(): void;
  stop(): void;
}

// ─── CameraScanner ────────────────────────────────────────

export interface CameraScannerOptions {
  onProgress?: (progress: number) => void;
  onVerified?: (result: VerificationResult) => void;
  onFailed?: (result: { error: string }) => void;
  onSync?: () => void;
  onFrame?: (frame: number[]) => void;
  analyzeSize?: number;
}

export class CameraScanner {
  constructor(videoElement: HTMLVideoElement, opts: CameraScannerOptions & {
    framing: ProtocolFraming;
  });
  start(): void;
  stop(): void;
  reset(): void;
}

// ─── ImageExporter ────────────────────────────────────────

export interface ImageExportOptions {
  width?: number;
  height?: number;
  background?: string;
}

export interface GIFExportOptions {
  width?: number;
  height?: number;
  duration?: number | null;
  fps?: number;
  quality?: number;
  background?: string;
}

export class ImageExporter {
  static export(opts: ImageExportOptions & {
    did: string;
    publicKeyHex: string;
    frames: number[][];
    finderCells: number[];
    gridSize: number;
  }): Promise<Uint8Array>;
}
