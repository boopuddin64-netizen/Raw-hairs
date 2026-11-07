import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'rawhairs_session';
const CSRF_COOKIE = 'rawhairs_csrf';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function getFirebaseAdminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    const error = new Error('Firebase Admin is not configured on this deployment.');
    error.statusCode = 503;
    throw error;
  }
  const app = getApps()[0] || initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
  return getAuth(app);
}
function cookieMap(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}
function pushCookie(req, name, value, { httpOnly = true, maxAge } = {}) {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  (req._rawHairsCookies ||= []).push(parts.join('; '));
}
export function flushAuthCookies(req, res) {
  if (!req._rawHairsCookies?.length) return;
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [current] : []), ...req._rawHairsCookies]);
}
export function issueCsrf(req) {
  // Reuse a valid existing token so a second tab or concurrent request does not invalidate this one.
  const existing = cookieMap(req)[CSRF_COOKIE];
  if (typeof existing === 'string' && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  const token = randomBytes(32).toString('base64url');
  pushCookie(req, CSRF_COOKIE, token, { httpOnly: false, maxAge: SESSION_MS / 1000 });
  return token;
}
export function assertCsrf(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  if (!origin || !host) {
    const error = new Error('Request origin could not be verified.');
    error.statusCode = 403;
    throw error;
  }
  let parsed;
  try { parsed = new URL(origin); } catch {
    const error = new Error('Request origin is invalid.');
    error.statusCode = 403;
    throw error;
  }
  if (parsed.host !== host || parsed.protocol !== `${protocol}:`) {
    const error = new Error('Cross-origin request rejected.');
    error.statusCode = 403;
    throw error;
  }
  const token = cookieMap(req)[CSRF_COOKIE];
  const header = req.headers['x-csrf-token'];
  if (!token || typeof header !== 'string' || token.length !== header.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(header))) {
    const error = new Error('Security token expired. Refresh the page and try again.');
    error.statusCode = 403;
    throw error;
  }
}
export async function createSessionCookie(req, res, idToken) {
  const auth = getFirebaseAdminAuth();
  await auth.verifyIdToken(idToken, true);
  const session = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MS });
  pushCookie(req, SESSION_COOKIE, session, { maxAge: SESSION_MS / 1000 });
  return session;
}
export async function getFirebaseSessionUser(req) {
  const session = cookieMap(req)[SESSION_COOKIE];
  if (!session) return null;
  try {
    return await getFirebaseAdminAuth().verifySessionCookie(session, true);
  } catch {
    return null;
  }
}
export async function requireFirebaseUser(req) {
  const user = await getFirebaseSessionUser(req);
  if (!user) {
    const error = new Error('Your session is invalid or has expired. Sign in again.');
    error.statusCode = 401;
    throw error;
  }
  return user;
}
export async function destroyFirebaseSession(req, res) {
  const session = cookieMap(req)[SESSION_COOKIE];
  if (session) {
    try {
      const identity = await getFirebaseAdminAuth().verifySessionCookie(session, false);
      await getFirebaseAdminAuth().revokeRefreshTokens(identity.uid);
    } catch {
      // Clear stale or already-revoked cookies as well.
    }
  }
  pushCookie(req, SESSION_COOKIE, '', { maxAge: 0 });
  pushCookie(req, CSRF_COOKIE, '', { httpOnly: false, maxAge: 0 });
  flushAuthCookies(req, res);
}
