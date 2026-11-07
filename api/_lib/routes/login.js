import { assertCsrf, createSessionCookie, flushAuthCookies } from '../firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    assertCsrf(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Server authentication is not configured.' });
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.idToken) {
      const code = data.error?.message || '';
      const message = code === 'USER_DISABLED' ? 'This account has been disabled. Contact support.' :
        code === 'TOO_MANY_ATTEMPTS_TRY_LATER' ? 'Too many attempts. Wait a little and try again.' :
        'Email or password is incorrect.';
      return res.status(code === 'TOO_MANY_ATTEMPTS_TRY_LATER' ? 429 : 401).json({ error: message });
    }
    await createSessionCookie(req, res, data.idToken);
    flushAuthCookies(req, res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS login error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'Sign-in is temporarily unavailable.' : error.message });
  }
}
