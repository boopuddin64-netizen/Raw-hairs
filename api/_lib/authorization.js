import { requireFirebaseUser } from './firebase.js';
import { getDb } from './db.js';

export async function requireStaff(req, allowedRoles = ['owner', 'manager']) {
  const identity = await requireFirebaseUser(req);
  const sql = getDb();
  const rows = await sql`
    SELECT id, firebase_uid, role, is_active
    FROM staff_users
    WHERE firebase_uid = ${identity.uid} AND is_active = true
    LIMIT 1
  `;
  const staff = rows[0];
  if (!staff || !allowedRoles.includes(staff.role)) {
    const error = new Error('You do not have permission to perform this action.');
    error.statusCode = 403;
    throw error;
  }
  return { identity, staff, sql };
}