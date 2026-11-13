import crypto from 'node:crypto';

/**
 * Paystack webhook signature verification (server-only).
 *
 * Two schemes are supported, so events verify no matter which the dashboard
 * sends for this account:
 *
 *  1. LEGACY: the `x-paystack-signature` header is the hex HMAC-SHA512 of the
 *     RAW request body, keyed with the Paystack secret key
 *     (sk_test_…/sk_live_… — the same key used for API calls).
 *
 *  2. VERSIONED: the header looks like `t=<unix seconds>,v1=<key id>:<hex sig>`
 *     and is HMAC-SHA512 of `<t>.<raw body>`, keyed with the webhook signing
 *     secret (whsec_…). The timestamp is checked against a ±300s tolerance so
 *     captured events cannot be replayed later.
 *
 * Either way, the signature is computed over the raw bytes Paystack sent —
 * callers must NOT JSON.parse the body first.
 */

const TOLERANCE_SECONDS = 300;

function safeHexEqual(aHex, bHex) {
  const a = Buffer.from(String(aHex).trim().toLowerCase(), 'hex');
  const b = Buffer.from(String(bHex).trim().toLowerCase(), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {Buffer} rawBody  exact bytes of the request body (never parsed JSON)
 * @param {string} header   value of the signature header
 * @param {string[]} secrets candidate signing secrets (e.g. [PAYSTACK_WEBHOOK_SECRET, PAYSTACK_SECRET_KEY])
 * @param {number} [now]    unix seconds; defaults to server time (injectable for tests)
 * @returns {boolean}
 */
export function verifyPaystackSignature(rawBody, header, secrets, now = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || header.length === 0) return false;
  const list = (secrets || []).filter((s) => typeof s === 'string' && s.length > 0);
  if (!list.length) return false;

  // Versioned scheme: "t=1760270400,v1=whk_3f9a1c2e:9d1b…e47a"
  if (header.includes('t=') && header.includes('v1=')) {
    let t = null;
    const signatures = [];
    for (const part of header.split(',')) {
      const i = part.indexOf('=');
      if (i === -1) continue;
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (key === 't') {
        if (t !== null || !/^[0-9]+$/.test(value)) return false;
        t = Number(value);
      } else if (key === 'v1') {
        const j = value.indexOf(':');
        if (j !== -1) signatures.push(value.slice(j + 1));
      }
    }
    if (t === null || !signatures.length) return false;
    if (Math.abs(now - t) > TOLERANCE_SECONDS) return false; // replay guard
    return signatures.some((hex) => list.some((secret) => safeHexEqual(
      crypto.createHmac('sha512', secret).update(`${t}.`).update(rawBody).digest('hex'),
      hex,
    )));
  }

  // Legacy scheme: hex HMAC-SHA512(raw body, secret key)
  return list.some((secret) => safeHexEqual(
    crypto.createHmac('sha512', secret).update(rawBody).digest('hex'),
    header,
  ));
}
