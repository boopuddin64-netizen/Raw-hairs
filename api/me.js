import { requireFirebaseUser } from './_lib/firebase.js';
import { getDb } from './_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const identity = await requireFirebaseUser(req);
    const sql = getDb();

    // Identity comes only from the verified Firebase token. Never accept a
    // customer UID, email, or role from the request body as authority.
    const email = typeof identity.email === 'string' ? identity.email.toLowerCase() : null;
    const displayName = typeof identity.name === 'string' ? identity.name.slice(0, 160) : null;

    const rows = await sql`
      INSERT INTO customers (firebase_uid, email, display_name)
      VALUES (${identity.uid}, ${email}, ${displayName})
      ON CONFLICT (firebase_uid) DO UPDATE
      SET email = COALESCE(EXCLUDED.email, customers.email),
          display_name = COALESCE(EXCLUDED.display_name, customers.display_name),
          updated_at = now()
      RETURNING id, email, phone, display_name, created_at, updated_at
    `;

    return res.status(200).json({ customer: rows[0] });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS /api/me error:', error.message);
    return res.status(status).json({
      error: status >= 500 ? 'Unable to load your account right now.' : error.message,
    });
  }
}
