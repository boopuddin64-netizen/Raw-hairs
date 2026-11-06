import { getDb } from '../_lib/db.js';
import { assertCsrf, createSession, hashPassword } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    assertCsrf(req);
    const { email: rawEmail, password, displayName } = req.body || {};
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    const name = typeof displayName === 'string' ? displayName.trim().slice(0, 160) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Use a password between 10 and 200 characters.' });
    if (!name) return res.status(400).json({ error: 'Enter your name.' });
    const sql = getDb();
    const passwordHash = await hashPassword(password);
    let rows;
    try {
      rows = await sql`INSERT INTO auth_users (email, password_hash, display_name) VALUES (${email}, ${passwordHash}, ${name}) RETURNING id, email, display_name`;
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account already exists with this email. Sign in instead.' });
      throw error;
    }
    const user = rows[0];
    const existing = await sql`SELECT id FROM customers WHERE lower(email) = ${email} AND auth_user_id IS NULL LIMIT 1`;
    if (existing[0]) {
      await sql`UPDATE customers SET auth_user_id = ${user.id}, display_name = COALESCE(display_name, ${name}), updated_at = now() WHERE id = ${existing[0].id}`;
    } else {
      await sql`INSERT INTO customers (auth_user_id, email, display_name) VALUES (${user.id}, ${email}, ${name})`;
    }
    await createSession(req, res, user.id);
    return res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.display_name } });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS register error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'We could not create your account right now.' : error.message });
  }
}
