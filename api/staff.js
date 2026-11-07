// One serverless function for staff and admin routes.
// vercel.json rewrites /api/staff/me and /api/admin/<name> here, so public URLs are unchanged.
// Every route enforces its own staff permission check.
import staffMe from './_lib/routes/staff-me.js';
import codEligibility from './_lib/routes/cod-eligibility.js';
import deliveryZones from './_lib/routes/delivery-zones.js';

export const routes = {
  'staff-me': staffMe,
  'cod-eligibility': codEligibility,
  'delivery-zones': deliveryZones,
};

export default async function handler(req, res) {
  const action = typeof req.query?.action === 'string' ? req.query.action : '';
  const route = Object.prototype.hasOwnProperty.call(routes, action) ? routes[action] : null;
  if (!route) return res.status(404).json({ error: 'Not found.' });
  return route(req, res);
}
