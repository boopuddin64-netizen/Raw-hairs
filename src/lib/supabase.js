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

/** Admin emails allowed via environment (bootstrap). Prefer app_metadata.role in production. */
export const adminEmails = parseEmailList(import.meta.env.VITE_ADMIN_EMAILS);

/** Driver emails allowed via environment (bootstrap). Prefer app_metadata.role in production. */
export const driverEmails = parseEmailList(import.meta.env.VITE_DRIVER_EMAILS);

export const staffConfigReady = supabaseConfigured;

/**
 * Trusted roles:
 * 1) app_metadata.role set by Supabase admin (preferred)
 * 2) email match against VITE_ADMIN_EMAILS / VITE_DRIVER_EMAILS (bootstrap until you set claims)
 * Never use user_metadata for authorization.
 */
export function getStaffRole(user) {
  if (!user) return null;
  const metaRole = user.app_metadata?.role;
  if (metaRole === 'owner' || metaRole === 'admin') return 'admin';
  if (metaRole === 'driver' || metaRole === 'rider') return 'driver';

  const email = (user.email || '').trim().toLowerCase();
  if (email && adminEmails.includes(email)) return 'admin';
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
