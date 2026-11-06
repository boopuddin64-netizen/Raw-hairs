import { getStaffContext } from '../_lib/authorization.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const { staff, permissions } = await getStaffContext(req);
    return res.status(200).json({ role: staff.role, permissions });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    if (status >= 500) console.error('RAW HAIRS staff profile error:', error.message);
    return res.status(status).json({ error: status >= 500 ? 'Unable to verify staff access.' : error.message });
  }
}
