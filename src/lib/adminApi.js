import { supabase } from './supabase';

const PRODUCT_BUCKET = 'product-images';

async function call(action, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/admin/${action}`, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'rh-admin' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (res.status === 401 && action !== 'login') window.dispatchEvent(new Event('rh-admin-unauthorized'));
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Browser client for the server-side admin API. The session lives in an HttpOnly cookie. */
export const adminApi = {
  session: () => call('session'),
  login: (email, password) => call('login', { method: 'POST', body: { email, password } }),
  logout: () => call('logout', { method: 'POST' }),
  data: () => call('data'),
  reviews: () => call('reviews'),
  settings: () => call('settings'),
  mutate: (table, op, { id, values } = {}) => call('mutate', { method: 'POST', body: { table, op, id, values } }),
  removeImage: (path) => call('remove-image', { method: 'POST', body: { path } }),
  /** Verify (true) or reject (false) a customer's bank-transfer receipt. */
  confirmTransfer: (paymentId, confirmed, note) => call('confirm-transfer', {
    method: 'POST',
    body: { payment_id: paymentId, confirmed, note: note || null },
  }),

  /** Server issues a one-time signed upload token; the file then goes straight to Storage. */
  async uploadProductImage(file) {
    const { path, token } = await call('upload-url', { method: 'POST', body: { contentType: file.type, size: file.size } });
    const { error } = await supabase.storage.from(PRODUCT_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw new Error('The product image could not be uploaded.');
    try {
      await call('verify-upload', { method: 'POST', body: { path } });
    } catch (verifyError) {
      await call('remove-image', { method: 'POST', body: { path } }).catch(() => {});
      throw verifyError;
    }
    return path;
  },
};
