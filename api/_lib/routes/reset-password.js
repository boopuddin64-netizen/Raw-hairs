import { assertCsrf } from '../firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    assertCsrf(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Password reset is not configured.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = data.error?.message || '';
      if (code !== 'EMAIL_NOT_FOUND') console.error('RAW HAIRS password reset provider response:', code);
    }
    // Do not reveal whether an email address is registered.
    return res.status(200).json({ ok: true, message: 'If an account exists for that email, a password reset message will be sent.' });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: status >= 500 ? 'Password reset is temporarily unavailable.' : error.message });
  }
}
