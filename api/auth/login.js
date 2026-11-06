import { getDb } from '../_lib/db.js';
import { assertCsrf, createSession, verifyPassword } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    assertCsrf(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Enter your email and password.' });
    const sql = getDb();
    const rows = await sql`SELECT id, email, display_name, password_hash FROM auth_users WHERE email = ${email} LIMIT 1`;
    if (!rows[0] || !rows[0].password_hash || !(await verifyPassword(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    await createSession(req, res, rows[0].id);
    return res.status(200).json({ user: { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name } });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS login error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'Sign-in is temporarily unavailable.' : error.message });
  }
}
