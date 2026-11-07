// One serverless function for all sign-in routes (keeps the project under Vercel's function limit).
// vercel.json rewrites /api/auth/<name> to /api/auth?action=<name>, so public URLs are unchanged.
import login from './_lib/routes/login.js';
import logout from './_lib/routes/logout.js';
import register from './_lib/routes/register.js';
import resetPassword from './_lib/routes/reset-password.js';
import session from './_lib/routes/session.js';
import googleStart from './_lib/routes/google-start.js';
import googleCallback from './_lib/routes/google-callback.js';

export const routes = {
  login,
  logout,
  register,
  'reset-password': resetPassword,
  session,
  'google-start': googleStart,
  'google-callback': googleCallback,
};

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return res.status(404).json({ error: 'Not found.' });
  return route(req, res);
}
