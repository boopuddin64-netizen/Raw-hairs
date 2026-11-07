import { assertCsrf, requireFirebaseUser } from './firebase.js';
import { getDb } from './db.js';

// Permissions are enforced by the API, never trusted from client-supplied roles.
export const STAFF_ROLE_PERMISSIONS = Object.freeze({
  owner: ['*'],
  rider: ['delivery:self:read', 'delivery:self:update'],
});

export async function getStaffContext(req) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) assertCsrf(req);
  const identity = await requireFirebaseUser(req);
  const sql = getDb();
  const rows = await sql`
    SELECT id, firebase_uid, role, is_active
    FROM staff_users
    WHERE firebase_uid = ${identity.uid} AND is_active = true
    LIMIT 1
  `;
  const staff = rows[0];
  if (!staff || !STAFF_ROLE_PERMISSIONS[staff.role]) {
    const error = new Error('An active staff account is required.');
    error.statusCode = 403;
    throw error;
  }
  return { identity, staff, sql, permissions: STAFF_ROLE_PERMISSIONS[staff.role] };
}

export async function requireStaff(req, allowedRoles = ['owner']) {
  const context = await getStaffContext(req);
  if (!allowedRoles.includes(context.staff.role)) {
    const error = new Error('You do not have permission to perform this action.');
    error.statusCode = 403;
    throw error;
  }
  return context;
}

export async function requireStaffPermission(req, permission) {
  const context = await getStaffContext(req);
  if (!context.permissions.includes('*') && !context.permissions.includes(permission)) {
    const error = new Error('You do not have permission to perform this action.');
    error.statusCode = 403;
    throw error;
  }
  return context;
}
