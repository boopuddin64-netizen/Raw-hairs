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

// return_requests stores its timestamp as submitted_at, not created_at.
// Every other snapshot table sorts by created_at.
const SNAPSHOT_SORT = { return_requests: 'submitted_at' };

const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Payment references come from the database (register_payment_intent RPC);
// accept the provider-safe charset without guessing an exact format.
const PAY_REF = /^[A-Za-z0-9._-]{6,100}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    const sortCol = SNAPSHOT_SORT[table] || 'created_at';
    const { data, error } = await db.from(table).select('*').order(sortCol, { ascending: false }).limit(300);
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

// ---------------------------------------------------------------------------
// Paystack payment endpoints (Phase 3). PUBLIC by design: customers (including
// guests) call pay-init/pay-verify. The webhook now lives in pay-webhook.js,
// a static endpoint that shadows this catch-all so it can verify signatures
// against the RAW request body.
// ---------------------------------------------------------------------------

async function paystackFetch(res, path, init) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) { json(res, 503, { error: 'Payment is not configured yet.' }); return null; }
  const r = await fetch('https://api.paystack.co' + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const out = await r.json().catch(() => null);
  if (!out) { json(res, 502, { error: 'Could not reach Paystack. Please try again.' }); return null; }
  return out;
}

async function payInit(req, res) {
  const db = needDb(res);
  if (!db) return;
  const { reference = '', email = '' } = readBody(req);
  if (!PAY_REF.test(reference)) return json(res, 400, { error: 'Invalid payment reference.' });

  const { data: payment, error } = await db
    .from('payments')
    .select('id, order_id, status, amount_kobo, currency, reference')
    .eq('reference', reference)
    .maybeSingle();
  if (error || !payment) return json(res, 404, { error: 'Payment reference not found.' });
  if (payment.status !== 'pending') return json(res, 409, { error: 'This payment was already processed.' });

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('status, total_kobo, guest_email, stock_reserved_until')
    .eq('id', payment.order_id)
    .maybeSingle();
  if (orderError || !order) return json(res, 404, { error: 'Order not found.' });
  if (order.status !== 'awaiting_payment') return json(res, 409, { error: 'This order can no longer be paid.' });
  if (order.stock_reserved_until && new Date(order.stock_reserved_until) < new Date()) {
    return json(res, 409, { error: 'Your reservation window has passed. Please start checkout again.' });
  }
  if (order.total_kobo !== payment.amount_kobo) {
    return json(res, 409, { error: 'Payment amount mismatch. Please contact support.' });
  }

  // Email is for the Paystack receipt only; money amounts are never taken from it.
  const payerEmail = order.guest_email || String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(payerEmail)) return json(res, 400, { error: 'A valid email is required for your receipt.' });

  const origin = `${req.headers?.['x-forwarded-proto'] || 'https'}://${req.headers?.host || ''}`;
  const out = await paystackFetch(res, '/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: payerEmail,
      amount: payment.amount_kobo,
      currency: 'NGN',
      reference: payment.reference,
      callback_url: `${origin}/#/checkout?pay=${payment.reference}`,
    }),
  });
  if (!out) return;
  if (!out.status || !out.data?.authorization_url) {
    return json(res, 502, { error: out.message || 'Paystack could not start the transaction.' });
  }
  return json(res, 200, {
    ok: true,
    authorization_url: out.data.authorization_url,
    reference: payment.reference,
    amount_kobo: payment.amount_kobo,
  });
}

async function recordVerifiedPayment(res, db, reference) {
  // Always re-verify with Paystack; never trust the caller's payload.
  const out = await paystackFetch(res, `/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  if (!out) return undefined; // paystackFetch already responded
  if (!out.status || out.data?.status !== 'success') {
    return { ok: false, status: out.data?.status || 'pending' };
  }
  const { data: result, error: rpcError } = await db.rpc('mark_payment_successful', {
    p_reference: reference,
    p_amount_kobo: out.data.amount,
    p_provider_response: { channel: out.data.channel, paid_at: out.data.paid_at, gateway_response: out.data.gateway_response },
  });
  if (rpcError) return { ok: false, error: 'Could not record the payment. Please contact support.' };
  if (result && result.ok === false) return { ok: false, error: result.error || 'Payment could not be recorded.' };
  return { ok: true, status: result?.status || 'recorded' };
}

async function payVerify(req, res) {
  const db = needDb(res);
  if (!db) return;
  const { reference = '' } = readBody(req);
  if (!PAY_REF.test(reference)) return json(res, 400, { error: 'Invalid payment reference.' });
  const result = await recordVerifiedPayment(res, db, reference);
  if (!result) return;
  // Return the order id so the confirmation screen can link guests straight
  // to their tracking page (they have no account to find it from).
  if (result.ok) {
    const { data: payment, error: payError } = await db
      .from('payments')
      .select('order_id')
      .eq('reference', reference)
      .maybeSingle();
    if (!payError && payment?.order_id) result.order_id = payment.order_id;
  }
  return json(res, result.ok ? 200 : result.error ? 409 : 200, result);
}

// ---------------------------------------------------------------------------
// Bank-transfer approval (owner-session action). Confirms or rejects a
// customer's submitted transfer receipt via the admin_confirm_bank_transfer
// RPC, which flips the payment + order, releases or consumes reservations and
// decrements stock atomically. The RPC guards the business invariants; this
// endpoint only authenticates the owner and forwards a validated payload.
// ---------------------------------------------------------------------------

async function confirmTransfer(req, res) {
  const { payment_id = '', confirmed, note } = readBody(req);
  if (typeof payment_id !== 'string' || !UUID.test(payment_id)) {
    return json(res, 400, { error: 'A valid payment id is required.' });
  }
  if (typeof confirmed !== 'boolean') {
    return json(res, 400, { error: 'Confirm must be true or false.' });
  }
  const noteText = typeof note === 'string' ? note.trim().slice(0, 300) : '';
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.rpc('admin_confirm_bank_transfer', {
    p_payment_id: payment_id,
    p_confirmed: confirmed,
    p_note: noteText || null,
  });
  if (error) return json(res, 500, { error: error.message });
  if (!data || data.ok !== true) {
    const messages = {
      forbidden: 'Only the owner can verify transfers.',
      payment_not_found: 'Payment not found (it must be a bank-transfer payment).',
      payment_not_pending_verification: 'This payment was already verified or rejected.',
      order_not_awaiting_payment: 'The order is no longer awaiting payment.',
    };
    return json(res, 400, { error: messages[data?.error] || 'Could not update the payment.' });
  }
  return json(res, 200, { ok: true, result: data.result, order_id: data.order_id });
}

// ---------------------------------------------------------------------------
// Rider job assignment (Phase 6). Owner-session action; delegates to the
// database RPC assign_rider_job which generates the one-time OTP and returns
// it here so the owner can share it with the customer.
// ---------------------------------------------------------------------------

async function assignJob(req, res) {
  const { job_id = '', rider_email = '' } = readBody(req);
  if (!UUID.test(job_id)) return json(res, 400, { error: 'A valid job id is required.' });
  if (!EMAIL_RE.test(String(rider_email).trim())) return json(res, 400, { error: 'A valid rider email is required.' });
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.rpc('assign_rider_job', {
    p_job_id: job_id,
    p_rider_email: String(rider_email).trim(),
  });
  if (error) return json(res, 500, { error: error.message });
  if (!data || data.ok !== true) {
    const messages = {
      rider_not_found: 'No user with that email exists. The rider must sign in to the driver portal at least once.',
      job_not_found: 'Job not found.',
      job_in_progress: 'This job is already assigned or in progress.',
      owner_only: 'Only the owner can assign jobs.',
    };
    return json(res, 400, { error: messages[data?.error] || 'Could not assign the rider.' });
  }
  // The OTP is shown ONCE here; the database stores only its hash.
  return json(res, 200, { ok: true, job_id: job_id, otp: data.otp });
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
  'pay-init': { method: 'POST', public: true, run: payInit },
  'pay-verify': { method: 'POST', public: true, run: payVerify },
  'confirm-transfer': { method: 'POST', run: confirmTransfer },
  'assign-job': { method: 'POST', run: assignJob },
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
