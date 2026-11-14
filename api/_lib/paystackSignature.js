import crypto from 'node:crypto';

const TOLERANCE_SECONDS = 300;
const SHA512_HEX = /^[0-9a-f]{128}$/i;
const VERSIONED_SIGNATURE = /^(?:[A-Za-z0-9_-]{1,64}:)?([0-9a-f]{128})$/i;

function safeHexEqual(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string'
      || !SHA512_HEX.test(aHex) || !SHA512_HEX.test(bHex)) return false;
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify Paystack's versioned webhook signature (`t=<unix>,v1=<key id>:<sig>`)
 * or the legacy HMAC-SHA512 of the raw body. A caller must pass the exact raw
 * request bytes; replay of legacy events is prevented by transaction-id
 * deduplication in the database.
 */
export function verifyPaystackSignature(rawBody, header, secrets, now = Math.floor(Date.now() / 1000)) {
  if (!Buffer.isBuffer(rawBody) || typeof header !== 'string' || header.length === 0 || header.length > 1024) return false;
  const list = (secrets || []).filter((secret) => typeof secret === 'string' && secret.length > 0);
  if (!list.length) return false;

  if (header.includes('t=') || header.includes('v1=')) {
    const parts = header.split(',');
    if (parts.length > 10) return false;
    let timestamp = null;
    const signatures = [];
    for (const part of parts) {
      const index = part.indexOf('=');
      if (index < 1) return false;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (key === 't') {
        if (timestamp !== null || !/^\d{1,12}$/.test(value)) return false;
        timestamp = Number(value);
      } else if (key === 'v1') {
        const match = VERSIONED_SIGNATURE.exec(value);
        if (!match) return false;
        signatures.push(match[1]);
      } else {
        return false;
      }
    }
    if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !signatures.length
        || !Number.isFinite(now) || Math.abs(now - timestamp) > TOLERANCE_SECONDS) return false;
    return signatures.some((signature) => list.some((secret) => safeHexEqual(
      crypto.createHmac('sha512', secret).update(`${timestamp}.`).update(rawBody).digest('hex'),
      signature,
    )));
  }

  if (!SHA512_HEX.test(header)) return false;
  return list.some((secret) => safeHexEqual(
    crypto.createHmac('sha512', secret).update(rawBody).digest('hex'),
    header,
  ));
}
