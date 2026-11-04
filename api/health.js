import { getDb } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const firebaseAdminConfigured = Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  let databaseConnected = false;
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    databaseConnected = true;
  } catch (error) {
    // Do not expose connection strings or provider details through this endpoint.
    console.error('RAW HAIRS database health check failed:', error.message);
  }

  const ok = databaseConnected && firebaseAdminConfigured;
  return res.status(ok ? 200 : 503).json({
    ok,
    service: 'raw-hairs-api',
    timestamp: new Date().toISOString(),
    checks: {
      databaseConnected,
      firebaseAdminConfigured,
    },
  });
}
