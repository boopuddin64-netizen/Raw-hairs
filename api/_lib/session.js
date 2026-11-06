import {
  createHash, createHmac, randomBytes, scrypt as scryptCallback,
  timingSafeEqual, createPublicKey, verify as verifySignature,
} from 'node:crypto';
import { promisify } from 'node:util';
import { getDb } from './db.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'rawhairs_session';
const CSRF_COOKIE = 'rawhairs_csrf';
const OAUTH_COOKIE = 'rawhairs_google_state';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function secureCookie(req) {
  return process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
}
function cookie(req, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (secureCookie(req)) parts.push('Secure');
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.clear) parts.push('Max-Age=0');
  const previous = req._rawHairsSetCookies || [];
  previous.push(parts.join('; '));
  req._rawHairsSetCookies = previous;
}
export function flushCookies(req, res) {
  if (req._rawHairsSetCookies?.length) {
    const existing = res.getHeader('Set-Cookie');
    const all = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...req._rawHairsSetCookies];
    res.setHeader('Set-Cookie', all);
  }
}
function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) throw fail('Request origin could not be verified.', 403);
  let parsed;
  try { parsed = new URL(origin); } catch { throw fail('Request origin is invalid.', 403); }
  if (parsed.host !== host) throw fail('Cross-origin request rejected.', 403);
  const expectedProtocol = req.headers['x-forwarded-proto'] || 'https';
  if (parsed.protocol !== `${expectedProtocol}:`) throw fail('Request protocol could not be verified.', 403);
}
export function assertCsrf(req) {
  assertSameOrigin(req);
  const jar = cookies(req);
  const fromHeader = req.headers['x-csrf-token'];
  if (!jar[CSRF_COOKIE] || typeof fromHeader !== 'string' || jar[CSRF_COOKIE].length !== fromHeader.length ||
      !timingSafeEqual(Buffer.from(jar[CSRF_COOKIE]), Buffer.from(fromHeader))) {
    throw fail('Security token expired. Refresh the page and try again.', 403);
  }
}
export function issueCsrf(req) {
  const token = randomBytes(32).toString('base64url');
  cookie(req, CSRF_COOKIE, token, { httpOnly: false, maxAge: SESSION_SECONDS });
  return token;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${Buffer.from(key).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [scheme, salt, expectedHex] = String(stored || '').split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(await scrypt(password, salt, 64));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function createSession(req, res, userId) {
  const raw = randomBytes(32).toString('base64url');
  const sql = getDb();
  await sql`INSERT INTO auth_sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${digest(raw)}, now() + interval '30 days')`;
  cookie(req, SESSION_COOKIE, raw, { maxAge: SESSION_SECONDS });
  const csrfToken = issueCsrf(req);
  flushCookies(req, res);
  return csrfToken;
}
export async function destroySession(req, res) {
  const token = cookies(req)[SESSION_COOKIE];
  if (token) {
    const sql = getDb();
    await sql`DELETE FROM auth_sessions WHERE token_hash = ${digest(token)}`;
  }
  cookie(req, SESSION_COOKIE, '', { clear: true });
  cookie(req, CSRF_COOKIE, '', { httpOnly: false, clear: true });
  flushCookies(req, res);
}
export async function getSessionUser(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const sql = getDb();
  const rows = await sql`
    SELECT u.id, u.email, u.display_name,
           c.id AS customer_id, s.id AS staff_id, s.role AS staff_role
    FROM auth_sessions a
    JOIN auth_users u ON u.id = a.user_id
    LEFT JOIN customers c ON c.auth_user_id = u.id
    LEFT JOIN staff_users s ON s.auth_user_id = u.id AND s.is_active = true
    WHERE a.token_hash = ${digest(token)}
      AND a.expires_at > now()
    LIMIT 1
  `;
  return rows[0] || null;
}
export async function requireSessionUser(req) {
  const user = await getSessionUser(req);
  if (!user) throw fail('Please sign in to continue.', 401);
  return user;
}
export function appOrigin(req) {
  const configured = process.env.APP_ORIGIN;
  if (configured) return configured.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  if (!host) throw fail('Application origin is not configured.', 503);
  return `${protocol}://${host}`;
}
function signState(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw fail('Server session secret is not configured.', 503);
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function readState(value) {
  const [body, signature] = String(value || '').split('.');
  const secret = process.env.SESSION_SECRET;
  if (!secret || !body || !signature) throw fail('Google sign-in state is invalid.', 400);
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw fail('Google sign-in state is invalid.', 400);
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!data.exp || data.exp < Date.now()) throw fail('Google sign-in request expired. Try again.', 400);
  return data;
}
export function createGoogleState(req) {
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  cookie(req, OAUTH_COOKIE, signState({ state, nonce, exp: Date.now() + 10 * 60 * 1000 }));
  return { state, nonce };
}
export function consumeGoogleState(req) {
  const value = cookies(req)[OAUTH_COOKIE];
  cookie(req, OAUTH_COOKIE, '', { clear: true });
  const data = readState(value);
  flushCookies(req, { getHeader: () => null, setHeader: () => {} });
  return data;
}
async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) throw fail('Google sign-in is not configured.', 503);
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw fail('Google identity token is invalid.', 401);
  const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw fail('Google identity token algorithm is not supported.', 401);
  const keysResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!keysResponse.ok) throw fail('Unable to verify Google identity right now.', 503);
  const { keys } = await keysResponse.json();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw fail('Google identity signing key was not found.', 401);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  if (!verifySignature('RSA-SHA256', signed, publicKey, Buffer.from(encodedSignature, 'base64url'))) {
    throw fail('Google identity signature is invalid.', 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      payload.aud !== clientId || !payload.sub || !payload.email || payload.email_verified !== true ||
      !payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now)) {
    throw fail('Google identity could not be verified.', 401);
  }
  return payload;
}
export async function exchangeGoogleCode(req, code, expectedNonce) {
  const origin = appOrigin(req);
  const redirectUri = `${origin}/api/auth/google/callback`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) throw fail('Google sign-in could not be completed. Try again.', 401);
  const identity = await verifyGoogleIdToken(data.id_token);
  if (identity.nonce !== expectedNonce) throw fail('Google sign-in nonce did not match.', 401);
  return identity;
}
export async function upsertGoogleUser(identity) {
  const sql = getDb();
  const email = identity.email.toLowerCase();
  const rows = await sql`
    INSERT INTO auth_users (email, display_name, email_verified_at, password_hash)
    VALUES (${email}, ${identity.name || null}, now(), NULL)
    ON CONFLICT (email) DO UPDATE
    SET display_name = COALESCE(auth_users.display_name, EXCLUDED.display_name),
        email_verified_at = COALESCE(auth_users.email_verified_at, now()),
        updated_at = now()
    RETURNING id
  `;
  await sql`
    INSERT INTO customers (auth_user_id, email, display_name)
    VALUES (${rows[0].id}, ${email}, ${identity.name || null})
    ON CONFLICT (auth_user_id) DO UPDATE
    SET email = EXCLUDED.email, display_name = COALESCE(customers.display_name, EXCLUDED.display_name), updated_at = now()
  `;
  return rows[0].id;
}
