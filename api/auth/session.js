import { getFirebaseSessionUser, issueCsrf, flushAuthCookies } from '../_lib/firebase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const csrfToken = issueCsrf(req);
    const identity = await getFirebaseSessionUser(req);
    flushAuthCookies(req, res);
    return res.status(200).json({
      configured: Boolean(process.env.FIREBASE_WEB_API_KEY && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_ORIGIN),
      csrfToken,
      user: identity ? { uid: identity.uid, email: identity.email || null, displayName: identity.name || null } : null,
    });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error('RAW HAIRS auth session error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'Authentication service is temporarily unavailable.' : error.message });
  }
}
