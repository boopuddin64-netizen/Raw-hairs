import { requireStaff } from '../_lib/authorization.js';
import { getFirebaseAdminAuth } from '../_lib/firebase.js';

const ROLES = new Set(['owner', 'manager', 'operations', 'rider']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(res, error) {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error('RAW HAIRS staff management error:', error.message);
  return res.status(status).json({ error: status >= 500 ? 'Staff management is temporarily unavailable.' : error.message });
}
export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const { staff, sql } = await requireStaff(req, ['owner']);
    if (req.method === 'GET') {
      const [users, events] = await Promise.all([
        sql`SELECT staff.id, staff.firebase_uid, staff.role, staff.is_active, staff.created_at, staff.updated_at, customer.email FROM staff_users staff LEFT JOIN customers customer ON customer.firebase_uid=staff.firebase_uid ORDER BY staff.created_at DESC`,
        sql`SELECT e.id, e.action, e.details, e.created_at, actor.role AS actor_role
            FROM staff_access_events e JOIN staff_users actor ON actor.id=e.actor_staff_id
            ORDER BY e.created_at DESC LIMIT 50`
      ]);
      return res.status(200).json({ staff: users, events });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.method === 'POST') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const role = body.role;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.has(role)) {
        return res.status(400).json({ error: 'Enter a valid email address and staff role.' });
      }
      let identity;
      try { identity = await getFirebaseAdminAuth().getUserByEmail(email); }
      catch (error) {
        if (error.code === 'auth/user-not-found') return res.status(404).json({ error: 'No registered account was found for that email. Ask the person to create a customer account first.' });
        throw error;
      }
      const existing = await sql`SELECT id FROM staff_users WHERE firebase_uid = ${identity.uid} LIMIT 1`;
      if (existing.length) return res.status(409).json({ error: 'This account is already registered as staff. Change its role or status in the staff list.' });
      const inserted = await sql`INSERT INTO staff_users(firebase_uid, role, is_active) VALUES (${identity.uid}, ${role}, true)
        RETURNING id, firebase_uid, role, is_active, created_at, updated_at`;
      await sql`INSERT INTO staff_access_events(actor_staff_id,target_staff_id,action,details)
        VALUES (${staff.id},${inserted[0].id},'staff_created',jsonb_build_object('email',${email},'role',${role}))`;
      return res.status(201).json({ staff: inserted[0] });
    }
    const id = typeof body.id === 'string' ? body.id : '';
    if (!UUID.test(id)) return res.status(400).json({ error: 'A valid staff record ID is required.' });
    const role = body.role === undefined ? null : body.role;
    const active = body.isActive === undefined ? null : body.isActive;
    if ((role !== null && !ROLES.has(role)) || (active !== null && typeof active !== 'boolean') || (role === null && active === null)) {
      return res.status(400).json({ error: 'Provide a valid role or active status.' });
    }
    if (id === staff.id && (active === false || (role !== null && role !== 'owner'))) {
      return res.status(400).json({ error: 'You cannot deactivate or demote your own owner account.' });
    }
    const current = await sql`SELECT id, role, is_active FROM staff_users WHERE id=${id} LIMIT 1`;
    if (!current.length) return res.status(404).json({ error: 'Staff account not found.' });
    if (current[0].role === 'owner' && current[0].is_active && (active === false || (role !== null && role !== 'owner'))) {
      const otherOwners = await sql`SELECT count(*)::int AS count FROM staff_users WHERE role='owner' AND is_active=true AND id<>${id}`;
      if (otherOwners[0].count < 1) return res.status(409).json({ error: 'At least one active owner must remain.' });
    }
    const updated = await sql`UPDATE staff_users SET role=COALESCE(${role},role), is_active=COALESCE(${active},is_active), updated_at=now()
      WHERE id=${id} RETURNING id,firebase_uid,role,is_active,created_at,updated_at`;
    await sql`INSERT INTO staff_access_events(actor_staff_id,target_staff_id,action,details)
      VALUES (${staff.id},${id},'staff_updated',jsonb_build_object('role',${updated[0].role},'is_active',${updated[0].is_active}))`;
    return res.status(200).json({ staff: updated[0] });
  } catch (error) { return fail(res, error); }
}
