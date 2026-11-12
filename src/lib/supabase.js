import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(
  typeof supabaseUrl === 'string' &&
  supabaseUrl.startsWith('https://') &&
  typeof supabasePublishableKey === 'string' &&
  supabasePublishableKey.trim().length > 0
);

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

function parseEmailList(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Driver emails allowed via environment (bootstrap). Prefer app_metadata roles in production. */
export const driverEmails = parseEmailList(import.meta.env.VITE_DRIVER_EMAILS);

export const staffConfigReady = supabaseConfigured;

/**
 * Supabase-auth roles (used by the driver portal):
 * 1) app_metadata.role / app_metadata.roles set by Supabase admin (preferred)
 * 2) email match against VITE_DRIVER_EMAILS (bootstrap until you set claims)
 * The ADMIN console does not use Supabase auth: it signs in against the server (/api/admin)
 * with credentials held in server environment variables.
 * Never use user_metadata for authorization.
 */
export function getStaffRole(user) {
  if (!user) return null;
  const appMeta = user.app_metadata || {};
  const metaRoles = [
    appMeta.role,
    ...(Array.isArray(appMeta.roles) ? appMeta.roles : []),
  ];
  if (metaRoles.includes('owner') || metaRoles.includes('admin')) return 'admin';
  if (metaRoles.includes('driver') || metaRoles.includes('rider')) return 'driver';

  const email = (user.email || '').trim().toLowerCase();
  if (email && driverEmails.includes(email)) return 'driver';
  return null;
}

export function isAdmin(user) {
  return getStaffRole(user) === 'admin';
}

export function isDriver(user) {
  const role = getStaffRole(user);
  return role === 'driver' || role === 'admin'; // admin can open driver tools
}

/** @deprecated use isAdmin */
export function isOwner(user) {
  return isAdmin(user);
}
