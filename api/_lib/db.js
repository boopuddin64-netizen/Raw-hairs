import { createClient } from '@supabase/supabase-js';

export const PRODUCT_BUCKET = 'product-images';

let client;

/**
 * Service-role Supabase client. Server-only: SUPABASE_SERVICE_ROLE_KEY must never be
 * prefixed with VITE_ (that would ship it to every visitor's browser).
 */
export function getDb() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ||= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
