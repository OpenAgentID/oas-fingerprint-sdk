// ============================================================
// oas-fingerprint-sdk — Reed-Solomon GF(2^8) Codec
// ============================================================
// Proven implementation. Polynomials in ascending degree.
// Corrects up to nsym/2 byte errors per block.
// ============================================================

const GF_POLY = 0x11d;
const EXP = new Array(512).fill(0);
const LOG = new Array(256).fill(-1);

;(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= GF_POLY;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a && b) ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
const div = (a, b) => a ? EXP[(LOG[a] - LOG[b] + 255) % 255] : 0;
const inv = a => EXP[255 - LOG[a]];

function pEval(p, x) {
  let r = 0, xi = 1;
  for (let i = 0; i < p.length; i++) { r ^= mul(p[i], xi); xi = mul(xi, x); }
  return r;
}

function pMul(a, b) {
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) r[i + j] ^= mul(a[i], b[j]);
  return r;
}

function pMod(dividend, divisor) {
  const out = [...dividend];
  const norm = inv(divisor[divisor.length - 1]);
  for (let i = out.length - divisor.length; i >= 0; i--) {
    const c = mul(out[i + divisor.length - 1], norm);
    if (c !== 0) for (let j = 0; j < divisor.length; j++) out[i + j] ^= mul(divisor[j], c);
  }
  return out.slice(0, divisor.length - 1);
}

function pScale(p, s) { return p.map(c => mul(c, s)); }

function pDeriv(p) {
  const d = [];
  for (let i = 1; i < p.length; i++) d.push(i & 1 ? p[i] : 0);
  return d.length ? d : [0];
}

function pAdd(a, b) {
  const len = Math.max(a.length, b.length), r = new Array(len).fill(0);
  for (let i = 0; i < a.length; i++) r[i] ^= a[i];
  for (let i = 0; i < b.length; i++) r[i] ^= b[i];
  return r;
}

function pTrim(p) { let i = p.length - 1; while (i > 0 && p[i] === 0) i--; return p.slice(0, i + 1); }

class ReedSolomon {
  constructor(nsym = 32) {
    this.nsym = nsym;
    let g = [1];
    for (let i = 0; i < nsym; i++) g = pMul(g, [EXP[i], 1]);
    this.gen = g;
  }

  encode(data) {
    const nsym = this.nsym, gen = this.gen;
    const shifted = new Array(nsym).fill(0).concat(Array.from(data));
    const rem = pMod(shifted, gen);
    const out = new Uint8Array(data.length + nsym);
    for (let i = 0; i < nsym; i++) out[i] = rem[i] || 0;
    for (let i = 0; i < data.length; i++) out[nsym + i] = data[i];
    return out;
  }

  syndromes(msg) {
    const s = new Array(this.nsym);
    for (let i = 0; i < this.nsym; i++) s[i] = pEval(Array.from(msg), EXP[i]);
    return s;
  }

  hasErrors(s) { return s.some(v => v !== 0); }

  _errLocator(syn) {
    let C = [1], B = [1], L = 0, m = 1, b = 1;
    for (let n = 0; n < this.nsym; n++) {
      let d = syn[n];
      for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, syn[n - i]);
      if (d === 0) {
        m++;
      } else if (2 * L <= n) {
        const T = [...C], coef = div(d, b);
        for (let i = 0; i < B.length; i++) {
          const idx = i + m;
          while (C.length <= idx) C.push(0);
          C[idx] ^= mul(coef, B[i]);
        }
        L = n + 1 - L; B = T; b = d; m = 1;
      } else {
        const coef = div(d, b);
        for (let i = 0; i < B.length; i++) {
          const idx = i + m;
          while (C.length <= idx) C.push(0);
          C[idx] ^= mul(coef, B[i]);
        }
        m++;
      }
    }
    if (L > this.nsym / 2) return null;
    return pTrim(C);
  }

  _errPositions(loc, n) {
    const pos = [];
    for (let i = 0; i < n; i++) if (pEval(loc, EXP[255 - i]) === 0) pos.push(i);
    return pos.length === loc.length - 1 ? pos : null;
  }

  _forney(syn, loc, pos) {
    const omega = pMul([...syn], loc).slice(0, this.nsym);
    const lp = pDeriv(loc);
    const corr = {};
    for (const p of pos) {
      const xi = EXP[p], xiInv = EXP[255 - p];
      const num = pEval(omega, xiInv), den = pEval(pTrim(lp), xiInv);
      if (den === 0) return null;
      corr[p] = mul(xi, div(num, den));
    }
    return corr;
  }

  decode(received) {
    const msg = new Uint8Array(received);
    const syn = this.syndromes(msg);
    if (!this.hasErrors(syn)) return { data: msg.slice(this.nsym), corrected: 0, errors: false };
    const loc = this._errLocator(syn);
    if (!loc) return { data: msg.slice(this.nsym), corrected: 0, errors: true };
    const pos = this._errPositions(loc, msg.length);
    if (!pos) return { data: msg.slice(this.nsym), corrected: 0, errors: true };
    const corr = this._forney(syn, loc, pos);
    if (!corr) return { data: msg.slice(this.nsym), corrected: 0, errors: true };
    for (const p of pos) msg[p] ^= corr[p] || 0;
    const check = this.syndromes(msg);
    if (this.hasErrors(check)) return { data: msg.slice(this.nsym), corrected: pos.length, errors: true };
    return { data: msg.slice(this.nsym), corrected: pos.length, errors: false };
  }
}

module.exports = { ReedSolomon, mul, div, inv, EXP, LOG, pEval, pMul };
