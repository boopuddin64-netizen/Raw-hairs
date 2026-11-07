import { assertCsrf, destroyFirebaseSession } from '../firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    assertCsrf(req);
    await destroyFirebaseSession(req, res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return res.status(status).json({ error: status >= 500 ? 'Unable to sign out right now.' : error.message });
  }
}
