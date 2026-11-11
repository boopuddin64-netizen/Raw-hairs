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

/**
 * Authorization must use app_metadata set by a trusted server/admin process.
 * Never authorize from user_metadata because users can edit it themselves.
 */
export function isOwner(user) {
  return user?.app_metadata?.role === 'owner';
}
