// ============================================================
// oas-fingerprint-sdk — Full Test Suite
// ============================================================

const { ReedSolomon } = require('../src/core/reed-solomon');
const { ProtocolFraming } = require('../src/core/protocol');
const { DIDCrypto } = require('../src/core/did-crypto');
const { Fingerprint } = require('../src/presenter/fingerprint');
const { Verifier } = require('../src/verifier/verifier');
const { ParticleSystem } = require('../src/renderers/particle-system');
const { ImageExporter } = require('../src/export/image-exporter');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`  ✗ ${msg}`); fail++; }
  else { console.log(`  ✓ ${msg}`); pass++; }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function arrEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function run() {

  // ============================================================
  console.log('\n═══ 1. Reed-Solomon ═══');

  const rs = new ReedSolomon(32);
  const data = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]);
  const enc = rs.encode(data);
  assert(enc.length === data.length + 32, `Encode: ${data.length}B → ${enc.length}B`);

  const r1 = rs.decode(enc);
  assert(!r1.errors && r1.corrected === 0, 'Clean decode');
  assert(arrEq(r1.data, data), 'Data matches');

  // Errors
  const bad = new Uint8Array(enc);
  const errPos = new Set();
  while (errPos.size < 14) errPos.add(Math.floor(Math.random() * bad.length));
  for (const p of errPos) bad[p] ^= 1 + Math.floor(Math.random() * 254);
  const r2 = rs.decode(bad);
  assert(!r2.errors, `14 errors corrected (${r2.corrected})`);
  assert(arrEq(r2.data, data), 'Corrected data matches');

  // Stress
  let maxOk = 0;
  for (let n = 1; n <= 20; n++) {
    const b = new Uint8Array(enc);
    const ep = new Set();
    while (ep.size < n) ep.add(Math.floor(Math.random() * b.length));
    for (const p of ep) b[p] ^= 0xff;
    const r = rs.decode(b);
    if (!r.errors) maxOk = n;
  }
  assert(maxOk >= 16, `Max correctable: ${maxOk} (expected ≥16)`);

  // ============================================================
  console.log('\n═══ 2. Protocol Framing ═══');

  const pf = new ProtocolFraming();
  const payload = new TextEncoder().encode('Hello OpenAgent Fingerprint');
  const { frames, totalFrames } = pf.encode(payload);
  assert(totalFrames > 0, `Encoded to ${totalFrames} frames`);

  const dec = pf.decode(frames);
  assert(!dec.partial && !dec.errors, 'Full decode success');
  assert(new TextDecoder().decode(dec.data) === 'Hello OpenAgent Fingerprint', 'Payload matches');

  // Sync detection
  const sync = pf.syncFrame();
  assert(pf.isSyncFrame(sync), 'Sync frame detected');
  const rnd = Array.from({ length: 64 }, () => Math.random() > 0.5 ? 1 : 0);
  assert(!pf.isSyncFrame(rnd), 'Random frame not sync');

  // Incremental
  const partial = pf.decode(frames.slice(0, 2));
  assert(partial.partial, 'Partial decode detected');
  assert(partial.progress > 0 && partial.progress < 1, `Progress: ${(partial.progress * 100).toFixed(0)}%`);

  // ============================================================
  console.log('\n═══ 3. DID Crypto ═══');

  const kp = await DIDCrypto.generateKeyPair({
    namespace: 'l1fe',
    kind: 'agent',
    identifier: 'test-suite',
  });
  assert(kp.did === 'did:oas:l1fe:agent:test-suite', `DID: ${kp.did}`);
  assert(kp.publicKeyJwk.kty === 'OKP', 'JWK type OKP');
  assert(kp.publicKeyJwk.crv === 'Ed25519', 'JWK curve Ed25519');
  assert(kp.publicKeyMultibase.startsWith('z'), `Public key multibase: ${kp.publicKeyMultibase}`);

  const kpDefault = await DIDCrypto.generateKeyPair({ namespace: 'l1fe' });
  assert(kpDefault.did.startsWith('did:oas:l1fe:agent:z'), `Default DID: ${kpDefault.did}`);

  let rejectedReservedNamespace = false;
  try {
    await DIDCrypto.generateKeyPair({ namespace: 'oas' });
  } catch (e) {
    rejectedReservedNamespace = /reserved namespace/i.test(e.message);
  }
  assert(rejectedReservedNamespace, 'Reserved namespace rejected');

  let rejectedUnknownKind = false;
  try {
    await DIDCrypto.generateKeyPair({ namespace: 'l1fe', kind: 'robot' });
  } catch (e) {
    rejectedUnknownKind = /unknown oas kind/i.test(e.message);
  }
  assert(rejectedUnknownKind, 'Unknown kind rejected');

  const claim = DIDCrypto.createClaim(kp.did, { platform: 'test', publicKeyMultibase: kp.publicKeyMultibase });
  assert(claim.issuer === kp.did, 'Claim issuer matches');
  assert(claim.credentialSubject.platform === 'test', 'Platform set');
  assert(Array.isArray(claim['@context']), 'Credential has JSON-LD contexts');
  assert(claim['@context'].includes('https://openagent.id/ns/attestation/v1'), 'OAS attestation context present');
  assert(Array.isArray(claim.type) && claim.type[0] === 'VerifiableCredential', 'Credential type is verifiable');

  const signed = await DIDCrypto.signClaim(kp.keyPair, claim);
  assert(signed.signature.length === 64, `Signature: ${signed.signature.length}B`);
  assert(signed.claim.proof.type === 'Ed25519Signature2020', `Proof type: ${signed.claim.proof.type}`);
  assert(signed.claim.proof.verificationMethod === `${kp.did}#key-1`, 'Verification method uses DID fragment');
  assert(signed.claim.proof.proofValue.startsWith('z'), 'Proof value is multibase');

  const pl = DIDCrypto.buildPayload(kp.publicKeyMultibase, signed.claimBytes);
  assert(pl.length > 0, `Payload: ${pl.length}B`);

  const vr = await DIDCrypto.verifyPayload(pl);
  assert(vr.valid, 'Signature verified');
  assert(vr.claim.issuer === kp.did, 'Verified DID matches');
  assert(vr.claim.proof.type === 'Ed25519Signature2020', 'Verified proof type matches');
  assert(vr.publicKeyMultibase === kp.publicKeyMultibase, 'Verified public key multibase matches');

  // Tamper test
  const tampered = new Uint8Array(pl);
  tampered[tampered.length - 1] ^= 0xff;
  const vr2 = await DIDCrypto.verifyPayload(tampered);
  assert(!vr2.valid, 'Tampered payload rejected');

  // ============================================================
  console.log('\n═══ 4. Challenge-Response ═══');

  const agentKP = await DIDCrypto.generateKeyPair({
    namespace: 'l1fe',
    kind: 'agent',
    identifier: 'challenge-agent',
  });
  const ch = DIDCrypto.createChallenge(agentKP.did, 5000);
  assert(ch.challenge.includes(agentKP.did), 'Challenge contains target DID');
  assert(ch.expiresAt > Date.now(), 'Challenge not expired');

  const response = await DIDCrypto.solveChallenge(
    agentKP.keyPair, agentKP.did, agentKP.publicKeyMultibase, ch.challenge
  );
  assert(response.length > 0, `Response: ${response.length}B`);

  const cv = await DIDCrypto.verifyChallengeResponse(response, ch);
  assert(cv.valid, 'Challenge-response verified');

  // Wrong challenge
  const fakeChallenge = { ...ch, challenge: 'oas:challenge:fake:nonce:123' };
  const cv2 = await DIDCrypto.verifyChallengeResponse(response, fakeChallenge);
  assert(!cv2.valid, 'Wrong challenge rejected');
  assert(cv2.error === 'Challenge mismatch', `Error: ${cv2.error}`);

  // Expired challenge
  const expiredCh = { ...ch, expiresAt: Date.now() - 1000 };
  const cv3 = await DIDCrypto.verifyChallengeResponse(response, expiredCh);
  assert(!cv3.valid, 'Expired challenge rejected');

  // Wrong DID
  const otherKP = await DIDCrypto.generateKeyPair();
  const wrongDIDChallenge = { ...ch, targetDID: otherKP.did };
  const cv4 = await DIDCrypto.verifyChallengeResponse(response, wrongDIDChallenge);
  assert(!cv4.valid, 'Wrong DID rejected');

  // ============================================================
  console.log('\n═══ 5. Fingerprint (Presenter) ═══');

  const fp = new Fingerprint();
  await fp.generate({
    namespace: 'l1fe',
    kind: 'agent',
    identifier: 'test-suite',
    platform: 'test-suite',
  });
  assert(fp.did === 'did:oas:l1fe:agent:test-suite', `Fingerprint DID: ${fp.did}`);
  assert(fp.publicKeyJwk.kty === 'OKP', 'Fingerprint export uses OKP JWK');

  const meta = fp.getMeta();
  assert(meta.payloadBytes > 0, `Payload: ${meta.payloadBytes}B`);
  assert(meta.totalFrames > 0, `Frames: ${meta.totalFrames}`);
  assert(meta.transmissionTime > 0, `TX time: ${meta.transmissionTime.toFixed(1)}s`);
  assert(meta.maxCorrectableErrors === 16, `Max errors: ${meta.maxCorrectableErrors}`);

  const { frames: fpFrames } = fp.getFrames();
  assert(fpFrames.length === meta.totalFrames, 'Frame count matches');

  // Key export/restore
  const keys = await fp.exportKeys();
  assert(keys.did === fp.did, 'Exported DID matches');

  const fp2 = await Fingerprint.fromJSON(keys);
  assert(fp2.did === fp.did, 'Restored DID matches');

  // Challenge solve
  const ch2 = DIDCrypto.createChallenge(fp.did);
  const resp = await fp.solveChallenge(ch2.challenge);
  assert(resp.payload.length > 0, `Challenge response: ${resp.payload.length}B`);
  assert(resp.frames.length > 0, `Response frames: ${resp.frames.length}`);

  // ============================================================
  console.log('\n═══ 6. Verifier ═══');

  const v = new Verifier();

  // Direct payload verification
  const vResult = await v.verifyPayload(fp.getPayload());
  assert(vResult.valid, 'Verifier: payload verified');
  assert(vResult.claim.issuer === fp.did, 'Verifier: DID matches');

  // Frame verification
  const fResult = await v.verifyFrames(fpFrames);
  assert(fResult.valid, 'Verifier: frames verified');

  // Challenge-response flow
  const vChallenge = v.createChallenge(fp.did);
  assert(vChallenge.nonce.length > 0, `Challenge nonce: ${vChallenge.nonce.slice(0, 8)}…`);

  const vResp = await fp.solveChallenge(vChallenge.challenge);
  const vCR = await v.verifyChallengeResponse(vResp.payload, vChallenge.nonce);
  assert(vCR.valid, 'Verifier: challenge-response verified');

  // One-time use
  const vCR2 = await v.verifyChallengeResponse(vResp.payload, vChallenge.nonce);
  assert(!vCR2.valid, 'Verifier: replayed challenge rejected');

  // Challenge animation encoding
  const anim = v.createChallengeAnimation(fp.did);
  assert(anim.frames.length > 0, `Challenge animation: ${anim.frames.length} frames`);

  // ============================================================
  console.log('\n═══ 7. Particle System ═══');

  const ps = new ParticleSystem({ did: 'did:oas:l1fe:agent:test', count: 100, radius: 100 });
  assert(ps.particles.length === 100, '100 particles created');

  ps.update(0);
  const sorted = ps.sorted();
  assert(sorted.length === 100, 'Sorted returns all particles');

  // Deterministic: same DID → same layout
  const ps2 = new ParticleSystem({ did: 'did:oas:l1fe:agent:test', count: 100, radius: 100 });
  assert(ps.particles[0].oTh === ps2.particles[0].oTh, 'Deterministic particle layout');
  assert(ps.particles[50].hu === ps2.particles[50].hu, 'Deterministic particle color');

  // Different DID → different layout
  const ps3 = new ParticleSystem({ did: 'did:oas:l1fe:agent:other', count: 100, radius: 100 });
  assert(ps.particles[0].oTh !== ps3.particles[0].oTh, 'Different DID → different layout');

  // ============================================================
  console.log('\n═══ 8. Image Export ═══');

  const img = ImageExporter.export({
    did: fp.did,
    frames: fpFrames,
    finderCells: [0, 7, 56, 63],
    gridSize: 8,
    width: 100,
    height: 100,
  });
  assert(img.width === 100 && img.height === 100, `Image: ${img.width}×${img.height}`);
  assert(img.pixels.length === 100 * 100 * 4, `Pixels: ${img.pixels.length} bytes`);

  // Not all black
  let nonBlack = 0;
  for (let i = 0; i < img.pixels.length; i += 4) {
    if (img.pixels[i] > 10 || img.pixels[i + 1] > 10 || img.pixels[i + 2] > 10) nonBlack++;
  }
  assert(nonBlack > 100, `Non-black pixels: ${nonBlack}`);

  // ============================================================
  console.log('\n═══ 8b. GIF Export ═══');

  const { GIFExporter } = require('../src/export/gif-exporter');
  const gifBytes = GIFExporter.export({
    did: fp.did,
    frames: fpFrames,
    finderCells: [0, 7, 56, 63],
    gridSize: 8,
    width: 80,
    height: 80,
    fps: 8,
    particleCount: 500,
  });
  assert(gifBytes.length > 100, `GIF: ${gifBytes.length} bytes`);
  // Check GIF header
  const header = String.fromCharCode(...gifBytes.slice(0, 6));
  assert(header === 'GIF89a', `GIF header: ${header}`);
  // Check trailer
  assert(gifBytes[gifBytes.length - 1] === 0x3B, 'GIF trailer present');

  // ============================================================
  console.log('\n═══ 9. End-to-End: Agent ↔ Verifier ═══');

  // Full flow: agent generates → verifier challenges → agent solves → verifier confirms
  const agent = await new Fingerprint().generate({ platform: 'e2e-test' });
  const verifier = new Verifier();

  // Step 1: Verifier sees agent's public fingerprint
  const agentPayload = agent.getPayload();
  const identity = await verifier.verifyPayload(agentPayload);
  assert(identity.valid, 'E2E: Agent identity verified');

  // Step 2: Verifier challenges the agent
  const e2eChallenge = verifier.createChallenge(agent.did);

  // Step 3: Agent solves the challenge
  const e2eResponse = await agent.solveChallenge(e2eChallenge.challenge);

  // Step 4: Verifier confirms the response
  const e2eResult = await verifier.verifyChallengeResponse(
    e2eResponse.payload, e2eChallenge.nonce
  );
  assert(e2eResult.valid, 'E2E: Challenge-response verified');
  assert(e2eResult.claim.issuer === agent.did, 'E2E: Correct agent responded');
  assert(e2eResult.claim.challenge === e2eChallenge.challenge, 'E2E: Correct challenge signed');

  // Step 5: Replay attempt
  const replay = await verifier.verifyChallengeResponse(
    e2eResponse.payload, e2eChallenge.nonce
  );
  assert(!replay.valid, 'E2E: Replay rejected');

  // Step 6: Impersonation attempt
  const impersonator = await new Fingerprint().generate();
  const fakeResponse = await impersonator.solveChallenge(e2eChallenge.challenge);
  const e2eChallenge2 = verifier.createChallenge(agent.did); // new challenge for real agent
  const impResult = await verifier.verifyChallengeResponse(
    fakeResponse.payload, e2eChallenge2.nonce
  );
  assert(!impResult.valid, 'E2E: Impersonator rejected');

  // ============================================================
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════════\n');

  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Test error:', e); process.exit(1); });
