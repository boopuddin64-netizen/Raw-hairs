import { assertCsrf, createSessionCookie, flushAuthCookies } from '../firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    assertCsrf(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;
    const displayName = String(req.body?.displayName || '').trim().slice(0, 160);
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Server authentication is not configured.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Use a password between 10 and 128 characters.' });
    if (!displayName) return res.status(400).json({ error: 'Enter your name.' });
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.idToken) {
      const code = data.error?.message || '';
      const message = code === 'EMAIL_EXISTS' ? 'An account already exists with this email. Sign in instead.' :
        code === 'WEAK_PASSWORD' ? 'Choose a stronger password.' : 'We could not create your account. Check your details and try again.';
      return res.status(code === 'EMAIL_EXISTS' ? 409 : 400).json({ error: message });
    }
    const profile = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: data.idToken, displayName, returnSecureToken: true }),
    });
    const profileData = await profile.json().catch(() => ({}));
    const token = profile.ok && profileData.idToken ? profileData.idToken : data.idToken;
    // Best-effort verification email. Staff access later requires a verified email.
    try {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: token }),
      });
    } catch { /* non-fatal */ }
    await createSessionCookie(req, res, token);
    flushAuthCookies(req, res);
    return res.status(201).json({ ok: true });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS registration error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'We could not create your account right now.' : error.message });
  }
}
