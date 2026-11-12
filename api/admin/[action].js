import {
  adminConfig, safeEqual, signToken, sessionCookie, getSession, requireAdmin, json,
  throttled, recordFailure, clearFailures, clientIp, SESSION_SECONDS,
} from '../_lib/auth.js';
import { getDb, PRODUCT_BUCKET } from '../_lib/db.js';

// Tables the admin console may change, and how. Anything else is rejected.
const WRITABLE = {
  products: ['insert', 'update', 'delete'],
  services: ['insert', 'update', 'delete'],
  orders: ['update'],
  bookings: ['update'],
  international_requests: ['update'],
  rider_jobs: ['insert', 'update'],
  return_requests: ['update'],
  payments: ['insert', 'update'],
  refund_transactions: ['insert', 'update'],
  reviews: ['insert', 'delete'],
  store_settings: ['upsert'],
};

// Dashboard snapshot: response key -> table.
const SNAPSHOT = [
  ['products', 'products'],
  ['services', 'services'],
  ['orders', 'orders'],
  ['bookings', 'bookings'],
  ['requests', 'international_requests'],
  ['jobs', 'rider_jobs'],
  ['payments', 'payments'],
  ['returns', 'return_requests'],
  ['refunds', 'refund_transactions'],
];

const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tables storing money in integer kobo. The admin UI sends naira for these
// fields; convert here so nothing writes naira into a kobo column.
const KOBO_TABLES = new Set(['products', 'orders', 'payments', 'refund_transactions']);
const KOBO_FIELDS = {
  products: ['price'],
  orders: ['subtotal', 'delivery_fee', 'total'],
  payments: ['amount'],
  refund_transactions: ['amount'],
};

function toKobo(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function needDb(res) {
  const db = getDb();
  if (!db) json(res, 503, { error: 'The server is missing its Supabase service-role configuration.' });
  return db;
}

async function login(req, res) {
  const cfg = adminConfig();
  if (!cfg.ok) return json(res, 503, { error: 'Admin login is not configured on the server yet.' });
  const ip = clientIp(req);
  if (throttled(ip)) return json(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });

  const { email = '', password = '' } = readBody(req);
  // Evaluate both comparisons so timing does not reveal which one failed.
  const emailOk = safeEqual(String(email).trim().toLowerCase(), cfg.email);
  const passOk = safeEqual(String(password), cfg.password);
  if (!(emailOk && passOk)) {
    recordFailure(ip);
    await sleep(600);
    return json(res, 401, { error: 'Incorrect email or password.' });
  }

  clearFailures(ip);
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({ role: 'admin', email: cfg.email, iat: now, exp: now + SESSION_SECONDS }, cfg.secret);
  res.setHeader('Set-Cookie', sessionCookie(req, token));
  return json(res, 200, { ok: true, email: cfg.email });
}

function logout(req, res) {
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return json(res, 200, { ok: true });
}

function session(req, res) {
  const cfg = adminConfig();
  const current = getSession(req);
  return json(res, 200, { ok: Boolean(current), email: current?.email || null, configured: cfg.ok });
}

async function snapshot(res) {
  const db = needDb(res);
  if (!db) return;
  const results = await Promise.all(SNAPSHOT.map(async ([key, table]) => {
    const { data, error } = await db.from(table).select('*').order('created_at', { ascending: false }).limit(300);
    return { key, table, data, error };
  }));
  const failed = results.find((r) => r.error);
  if (failed) return json(res, 500, { error: `${failed.error.message} (loading ${failed.table})` });
  return json(res, 200, Object.fromEntries(results.map((r) => [r.key, r.data || []])));
}

async function reviews(res) {
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.from('reviews').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, { reviews: data || [] });
}

async function settings(res) {
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.from('store_settings').select('settings, rules, goals').eq('id', 'default').maybeSingle();
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, { row: data || null });
}

async function auditLog(req, res) {
  const db = needDb(res);
  if (!db) return;
  const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
  const { data, error } = await db.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, { audit: data || [] });
}

async function mutate(req, res) {
  const { table, op, id, values } = readBody(req);
  if (!WRITABLE[table]?.includes(op)) return json(res, 400, { error: 'That change is not allowed.' });
  const needsValues = op !== 'delete';
  const needsId = op === 'update' || op === 'delete';
  if (needsId && !(typeof id === 'string' && UUID.test(id))) return json(res, 400, { error: 'A valid id is required.' });
  if (needsValues && (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 40)) {
    return json(res, 400, { error: 'Invalid values.' });
  }

  const row = needsValues ? { ...values } : null;
  if (op === 'update') { delete row.id; delete row.created_at; }
  if (op === 'insert') delete row.id;
  if (op === 'upsert' && row.id !== 'default') return json(res, 400, { error: 'Invalid settings row.' });

  // Kobo safety: convert naira money fields coming from the admin UI into kobo.
  if (row && KOBO_TABLES.has(table)) {
    for (const field of KOBO_FIELDS[table]) {
      if (row[field] != null && row[`${field}_kobo`] == null) {
        const kobo = toKobo(row[field]);
        if (kobo == null) return json(res, 400, { error: `Invalid amount for ${field}.` });
        row[`${field}_kobo`] = kobo;
      }
      delete row[field]; // never write naira into the (now kobo-authoritative) columns
    }
  }

  // Order workflow guard: manual payment-status faking is not allowed through
  // generic mutation. Payment state lives in public.payments only.
  if (table === 'orders' && row && ('paid' in row || 'payment_status' in row)) {
    return json(res, 400, { error: 'Payment status is managed by the payment workflow, not by direct order edits.' });
  }

  const db = needDb(res);
  if (!db) return;

  let query = db.from(table);
  if (op === 'insert') query = query.insert(row);
  else if (op === 'upsert') query = query.upsert(row);
  else if (op === 'update') query = query.update(row).eq('id', id);
  else query = query.delete().eq('id', id);

  const { data, error } = await query.select();
  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return json(res, status, { error: error.code === '23505' ? 'That value already exists (duplicate slug?).' : error.message });
  }
  if ((op === 'update' || op === 'delete') && !data?.length) return json(res, 404, { error: 'Nothing matched that id.' });
  return json(res, 200, { ok: true, row: data?.[0] || null });
}

async function uploadUrl(req, res) {
  const { contentType, size } = readBody(req);
  const ext = IMAGE_EXT[contentType];
  if (!ext) return json(res, 400, { error: 'Use a JPG, PNG or WebP image.' });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) return json(res, 400, { error: 'Image must be 5 MB or smaller.' });
  const db = needDb(res);
  if (!db) return;
  const path = `products/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(PRODUCT_BUCKET).createSignedUploadUrl(path);
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, { path, token: data.token });
}

async function removeImage(req, res) {
  const { path } = readBody(req);
  if (typeof path !== 'string' || !/^products\/[A-Za-z0-9._-]+$/.test(path) || path.includes('..')) {
    return json(res, 400, { error: 'Invalid image path.' });
  }
  const db = needDb(res);
  if (!db) return;
  const { error } = await db.storage.from(PRODUCT_BUCKET).remove([path]);
  if (error) return json(res, 500, { error: error.message });
  return json(res, 200, { ok: true });
}

const ROUTES = {
  login: { method: 'POST', public: true, run: login },
  logout: { method: 'POST', public: true, run: logout },
  session: { method: 'GET', public: true, run: session },
  data: { method: 'GET', run: (req, res) => snapshot(res) },
  reviews: { method: 'GET', run: (req, res) => reviews(res) },
  settings: { method: 'GET', run: (req, res) => settings(res) },
  audit: { method: 'GET', run: auditLog },
  mutate: { method: 'POST', run: mutate },
  'upload-url': { method: 'POST', run: uploadUrl },
  'remove-image': { method: 'POST', run: removeImage },
};

export default async function handler(req, res) {
  const route = ROUTES[req.query?.action];
  if (!route) return json(res, 404, { error: 'Not found.' });
  if (req.method !== route.method) {
    res.setHeader('Allow', route.method);
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (!route.public && !requireAdmin(req, res, { mutating: route.method !== 'GET' })) return undefined;
  try {
    return await route.run(req, res);
  } catch (err) {
    console.error('[admin api]', req.query?.action, err);
    return json(res, 500, { error: 'Something went wrong on the server.' });
  }
}
