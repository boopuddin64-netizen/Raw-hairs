import { supabase } from './supabase';

export const PRODUCT_BUCKET = 'product-images';

const isExternal = (path) => /^(https?:)?\/\//i.test(path || '');

/** True when image_path points at an object in the product-images bucket (admin upload). */
export const isStoragePath = (path) => Boolean(path) && !isExternal(path) && !path.startsWith('/');

/**
 * Resolve a products.image_path to a displayable URL.
 * - "/catalogue/x.jpg" or "https://..." : used as-is (static file / external)
 * - "products/<uuid>.jpg"              : public URL from the product-images bucket
 */
export function productImageUrl(path) {
  if (!path) return '';
  if (isExternal(path) || path.startsWith('/')) return path;
  if (!supabase) return '';
  return supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path).data?.publicUrl || '';
}
