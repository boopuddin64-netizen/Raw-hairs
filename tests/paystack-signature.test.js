import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyPaystackSignature } from '../api/_lib/paystackSignature.js';

// Tests cover both schemes the dashboard may send:
//   legacy  : hex HMAC-SHA512(raw body, PAYSTACK_SECRET_KEY)
//   versioned: "t=<unix>,v1=<kid>:<hex HMAC-SHA512(`${t}.` + raw body, whsec_)>"

const SECRET = 'sk_test_abc123';
const WHSEC = 'whsec_supersecret';
const RAW = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'RAWHAIRS-1-abc' } }));

function legacySig(body, secret) {
  return crypto.createHmac('sha512', secret).update(body).digest('hex');
}

function versionedSig(body, t, secret) {
  return `t=${t},v1=whk_test01:${crypto.createHmac('sha512', secret).update(`${t}.`).update(body).digest('hex')}`;
}

describe('verifyPaystackSignature', () => {
  it('accepts a correct legacy signature', () => {
    expect(verifyPaystackSignature(RAW, legacySig(RAW, SECRET), [SECRET])).toBe(true);
  });

  it('accepts a correct versioned signature within tolerance', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyPaystackSignature(RAW, versionedSig(RAW, now, WHSEC), [WHSEC], now)).toBe(true);
  });

  it('tries every candidate secret (fallback to PAYSTACK_SECRET_KEY works)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyPaystackSignature(RAW, versionedSig(RAW, now, SECRET), [WHSEC, SECRET], now)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    expect(verifyPaystackSignature(RAW, legacySig(RAW, 'wrong'), [SECRET])).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyPaystackSignature(Buffer.from('{"tampered":true}'), legacySig(RAW, SECRET), [SECRET])).toBe(false);
  });

  it('rejects an expired timestamp (replay protection)', () => {
    const now = Math.floor(Date.now() / 1000);
    const old = now - 301;
    expect(verifyPaystackSignature(RAW, versionedSig(RAW, old, WHSEC), [WHSEC], now)).toBe(false);
  });

  it('accepts a timestamp at exactly the tolerance edge (300s)', () => {
    const now = Math.floor(Date.now() / 1000);
    const edge = now - 300;
    expect(verifyPaystackSignature(RAW, versionedSig(RAW, edge, WHSEC), [WHSEC], now)).toBe(true);
  });

  it('rejects truncated and malformed legacy hex signatures', () => {
    expect(verifyPaystackSignature(RAW, legacySig(RAW, SECRET).slice(0, 40), [SECRET])).toBe(false);
    expect(verifyPaystackSignature(RAW, `${legacySig(RAW, SECRET).slice(0, 127)}z`, [SECRET])).toBe(false);
  });

  it('rejects duplicate or malformed versioned timestamp fields', () => {
    const now = Math.floor(Date.now() / 1000);
    const valid = versionedSig(RAW, now, WHSEC);
    expect(verifyPaystackSignature(RAW, `${valid},t=${now}`, [WHSEC], now)).toBe(false);
    expect(verifyPaystackSignature(RAW, `t=${now}x,v1=whk_test01:${'a'.repeat(128)}`, [WHSEC], now)).toBe(false);
  });

  it('accepts a key-id-prefixed versioned signature', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyPaystackSignature(RAW, versionedSig(RAW, now, WHSEC), [WHSEC], now)).toBe(true);
  });

  it('rejects a missing/empty header', () => {
    expect(verifyPaystackSignature(RAW, '', [SECRET])).toBe(false);
  });

  it('rejects when no secrets are configured', () => {
    expect(verifyPaystackSignature(RAW, legacySig(RAW, SECRET), [undefined, ''])).toBe(false);
  });

  it('rejects non-buffer body', () => {
    expect(verifyPaystackSignature(RAW.toString('utf8'), legacySig(RAW, SECRET), [SECRET])).toBe(false);
  });
});
