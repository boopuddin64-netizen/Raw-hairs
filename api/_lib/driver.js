import { getDb } from './db.js';

export async function requireDriver(req, res) {
  const authorization = req.headers?.authorization || '';
  const match = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(String(authorization));
  if (!match) { res.status(401).json({ error: 'Sign in to continue.' }); return null; }
  const db = getDb();
  if (!db) { res.status(503).json({ error: 'Driver services are unavailable.' }); return null; }
  const { data, error } = await db.auth.getUser(match[1]);
  const user = data?.user;
  if (error || !user?.id) { res.status(401).json({ error: 'Your session has expired. Sign in again.' }); return null; }
  const meta = user.app_metadata || {};
  const role = ['driver','rider'].includes(meta.role) || (Array.isArray(meta.roles) && meta.roles.some((r) => ['driver','rider'].includes(r)));
  const allow = new Set(String(process.env.DRIVER_EMAILS || process.env.VITE_DRIVER_EMAILS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
  if (!role && !allow.has(String(user.email || '').trim().toLowerCase())) {
    res.status(403).json({ error: 'This account is not approved for driver actions.' }); return null;
  }
  return { db, user };
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
