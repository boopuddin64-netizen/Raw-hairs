import crypto from 'node:crypto';

/**
 * Admin session helpers. Everything here is server-only.
 * Credentials come from Vercel environment variables, never from the browser bundle:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET (32+ chars)
 */

export const COOKIE_NAME = 'rh_admin';
export const COOKIE_PATH = '/api/admin';
export const SESSION_SECONDS = 12 * 60 * 60;

export function adminConfig() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.ADMIN_SESSION_SECRET || '';
  return { ok: Boolean(email && password && secret.length >= 32), email, password, secret };
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest();

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

export function signToken(payload, secret) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers?.cookie || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}

const isHttps = (req) => (req.headers?.['x-forwarded-proto'] || '').split(',')[0] === 'https';

export function sessionCookie(req, token, maxAge = SESSION_SECONDS) {
  return [
    `${COOKIE_NAME}=${token}`,
    `Path=${COOKIE_PATH}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    ...(isHttps(req) ? ['Secure'] : []),
  ].join('; ');
}

/** Returns the session payload, or null when there is no valid admin session. */
export function getSession(req) {
  const { ok, secret } = adminConfig();
  if (!ok) return null;
  const payload = verifyToken(readCookie(req, COOKIE_NAME), secret);
  return payload?.role === 'admin' ? payload : null;
}

export function json(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

/**
 * Guard for admin routes. State-changing requests must also carry the custom header,
 * which a cross-site form post cannot send (defence in depth on top of SameSite=Strict).
 */
export function requireAdmin(req, res, { mutating = false } = {}) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { error: 'Admin session expired. Sign in again.' });
    return null;
  }
  if (mutating && req.headers['x-requested-with'] !== 'rh-admin') {
    json(res, 403, { error: 'Request rejected.' });
    return null;
  }
  return session;
}

/** Small per-instance login throttle. Best effort; the password itself is the real protection. */
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function throttled(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export function clearFailures(ip) {
  attempts.delete(ip);
}

export function clientIp(req) {
  return (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}
