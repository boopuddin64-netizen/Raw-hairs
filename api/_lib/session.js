import { createHmac, randomBytes, timingSafeEqual, createPublicKey, verify as verifySignature } from 'node:crypto';

const OAUTH_COOKIE = 'rawhairs_google_state';
function cookieMap(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const i = part.indexOf('=');
    return i < 0 ? ['', ''] : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }).filter(([key]) => key));
}
function setCookie(req, name, value) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https') parts.push('Secure');
  (req._rawHairsCookies ||= []).push(parts.join('; '));
}
export function flushCookies(req, res) {
  if (!req._rawHairsCookies?.length) return;
  const current = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(current) ? current : current ? [current] : []), ...req._rawHairsCookies]);
}
export function appOrigin(req) {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  if (!host) throw new Error('APP_ORIGIN is not configured.');
  return `${protocol}://${host}`;
}
function signState(data) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
export function createGoogleState(req) {
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  setCookie(req, OAUTH_COOKIE, signState({ state, nonce, exp: Date.now() + 10 * 60 * 1000 }));
  return { state, nonce };
}
export function consumeGoogleState(req) {
  const value = cookieMap(req)[OAUTH_COOKIE];
  setCookie(req, OAUTH_COOKIE, '');
  const [body, signature] = String(value || '').split('.');
  const secret = process.env.SESSION_SECRET;
  if (!secret || !body || !signature) throw new Error('Google sign-in state is invalid.');
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Google sign-in state is invalid.');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!data.exp || data.exp < Date.now()) throw new Error('Google sign-in request expired. Try again.');
  return data;
}
async function verifyGoogleToken(token) {
  const [head, body, signature] = token.split('.');
  if (!head || !body || !signature) throw new Error('Google identity token is invalid.');
  const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Google token algorithm is not supported.');
  const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!response.ok) throw new Error('Google signing keys could not be loaded.');
  const keys = (await response.json()).keys || [];
  const jwk = keys.find((item) => item.kid === header.kid);
  if (!jwk) throw new Error('Google signing key was not found.');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(`${head}.${body}`);
  if (!verifySignature('RSA-SHA256', signed, key, Buffer.from(signature, 'base64url'))) throw new Error('Google identity signature is invalid.');
  const now = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      payload.aud !== process.env.GOOGLE_CLIENT_ID || payload.email_verified !== true ||
      !payload.email || !payload.sub || !payload.exp || payload.exp <= now) {
    throw new Error('Google identity could not be verified.');
  }
  return payload;
}
export async function exchangeGoogleCode(req, code, expectedNonce) {
  const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
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
  if (!response.ok || !data.id_token) throw new Error('Google sign-in could not be completed.');
  const identity = await verifyGoogleToken(data.id_token);
  if (identity.nonce !== expectedNonce) throw new Error('Google sign-in nonce did not match.');
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY is not configured on the server.');
  const firebaseResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(data.id_token)}&providerId=google.com`,
      requestUri: appOrigin(req), returnSecureToken: true, returnIdpCredential: true,
    }),
  });
  const firebaseData = await firebaseResponse.json().catch(() => ({}));
  if (!firebaseResponse.ok || !firebaseData.idToken) throw new Error(firebaseData.error?.message || 'Google account could not be connected to RAW HAIRS.');
  return firebaseData.idToken;
}
