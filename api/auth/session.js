import { issueCsrf, flushCookies, getSessionUser } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const csrfToken = issueCsrf(req);
    const user = await getSessionUser(req);
    flushCookies(req, res);
    return res.status(200).json({
      configured: Boolean(process.env.DATABASE_URL && process.env.SESSION_SECRET?.length >= 32),
      googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_ORIGIN),
      csrfToken,
      user: user ? { id: user.id, email: user.email, displayName: user.display_name, customerId: user.customer_id, staffRole: user.staff_role } : null,
    });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    console.error('RAW HAIRS auth session error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'Authentication service is temporarily unavailable.' : error.message });
  }
}
