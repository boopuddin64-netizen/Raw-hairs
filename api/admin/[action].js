import crypto from 'node:crypto';
import {
  adminConfig, safeEqual, signToken, sessionCookie, getSession, requireAdmin, json, SESSION_SECONDS,
} from '../_lib/auth.js';
import { getDb, PRODUCT_BUCKET } from '../_lib/db.js';
import { consumeRateLimit, clearRateLimit, rateLimitKey } from '../_lib/rateLimit.js';
import { inspectImageBuffer } from '../_lib/imageValidation.js';
import { isSameOriginRequest, readJsonBody, trustedRequestOrigin } from '../_lib/request.js';

// Tables the admin console may change, and how. Anything else is rejected.
const MUTABLE_FIELDS = {
  products: {
    insert: ['name', 'slug', 'category', 'price', 'stock', 'weight_grams', 'base_length', 'length_options', 'lace_options', 'hair_type', 'description', 'is_active', 'image_path', 'product_type_id', 'category_id', 'attributes', 'gallery_paths'],
    update: ['name', 'slug', 'category', 'price', 'stock', 'weight_grams', 'base_length', 'length_options', 'lace_options', 'hair_type', 'description', 'is_active', 'image_path', 'product_type_id', 'category_id', 'attributes', 'gallery_paths'],
  },
  catalog_product_types: {
    insert: ['name', 'slug', 'is_active', 'sort_order'],
    update: ['name', 'is_active', 'sort_order'],
  },
  catalog_categories: {
    insert: ['product_type_id', 'name', 'slug', 'is_active', 'sort_order'],
    update: ['name', 'slug', 'is_active', 'sort_order'],
  },
  catalog_attribute_definitions: {
    insert: ['product_type_id', 'key', 'label', 'field_type', 'options', 'is_required', 'display_in_specs', 'is_active', 'sort_order'],
    update: ['label', 'options', 'is_required', 'display_in_specs', 'is_active', 'sort_order'],
  },
  services: {
    insert: ['name', 'description', 'price', 'duration_minutes', 'is_active'],
    update: ['name', 'description', 'price', 'duration_minutes', 'is_active'],
  },
  orders: { update: ['status'] },
  bookings: { update: ['status'] },
  international_requests: { update: ['status'] },
  reviews: { insert: ['customer_name', 'rating', 'comment', 'product_id'] },
  store_settings: { upsert: ['id', 'settings', 'rules', 'goals', 'updated_at'] },
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

function toKobo(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return null;
  const kobo = Math.round(n * 100);
  return Number.isSafeInteger(kobo) ? kobo : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readBody(req) {
  return req._rhBody || (req._rhBody = readJsonBody(req, { maxBytes: 32 * 1024 }));
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withinJsonLimit(value, limit = 16 * 1024) {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= limit; } catch { return false; }
}

export function validateMutation(table, op, row) {
  const allowed = MUTABLE_FIELDS[table]?.[op];
  if (!allowed) return 'That change is not allowed.';
  const extra = Object.keys(row || {}).find((key) => !allowed.includes(key));
  if (extra) return `The ${extra} field cannot be changed here.`;

  if (table === 'products') {
    if (op === 'insert' && (!String(row.name || '').trim() || !String(row.slug || '').trim())) return 'Product name and slug are required.';
    if ('name' in row && (typeof row.name !== 'string' || row.name.trim().length < 1 || row.name.length > 160)) return 'Product name is invalid.';
    if ('slug' in row && (typeof row.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug))) return 'Product slug is invalid.';
    if ('category' in row && row.category != null && (typeof row.category !== 'string' || row.category.length > 100)) return 'Product category is invalid.';
    if ('description' in row && row.description != null && (typeof row.description !== 'string' || row.description.length > 6000)) return 'Product description is too long.';
    if ('hair_type' in row && row.hair_type != null && (typeof row.hair_type !== 'string' || row.hair_type.length > 120)) return 'Product type is invalid.';
    if ('price' in row && (row.price == null || toKobo(row.price) == null)) return 'Product price is invalid.';
    if (op === 'insert' && !('price' in row)) return 'Product price is required.';
    if ('stock' in row && (!Number.isInteger(Number(row.stock)) || Number(row.stock) < 0 || Number(row.stock) > 1_000_000)) return 'Stock must be a whole number between 0 and 1,000,000.';
    if ('weight_grams' in row && row.weight_grams != null && (!Number.isInteger(Number(row.weight_grams)) || Number(row.weight_grams) < 1 || Number(row.weight_grams) > 1_000_000)) return 'Product weight is invalid.';
    if ('base_length' in row && row.base_length != null && (!Number.isInteger(Number(row.base_length)) || Number(row.base_length) < 1 || Number(row.base_length) > 240)) return 'Product length is invalid.';
    if ('length_options' in row && (!Array.isArray(row.length_options) || row.length_options.length > 40 || row.length_options.some((v) => !Number.isInteger(v) || v < 1 || v > 240))) return 'Product length options are invalid.';
    if ('lace_options' in row && (!Array.isArray(row.lace_options) || row.lace_options.length > 30 || row.lace_options.some((v) => typeof v !== 'string' || v.length > 100))) return 'Product options are invalid.';
    if ('is_active' in row && typeof row.is_active !== 'boolean') return 'Product visibility is invalid.';
    if ('image_path' in row && row.image_path != null && (typeof row.image_path !== 'string' || row.image_path.length > 1024)) return 'Product image path is invalid.';
    if ('product_type_id' in row && row.product_type_id != null && !UUID.test(String(row.product_type_id))) return 'Product type is invalid.';
    if ('category_id' in row && row.category_id != null && !UUID.test(String(row.category_id))) return 'Product category is invalid.';
    if ('attributes' in row && (!isPlainRecord(row.attributes) || !withinJsonLimit(row.attributes, 8192) || Object.keys(row.attributes).length > 30)) return 'Product attributes are invalid or too large.';
    if ('gallery_paths' in row && (!Array.isArray(row.gallery_paths) || row.gallery_paths.length > 7 || row.gallery_paths.some((path) => typeof path !== 'string' || path.length > 1024))) return 'Product gallery is invalid.';
  }
  if (table === 'catalog_product_types' || table === 'catalog_categories') {
    const nameLimit = table === 'catalog_categories' ? 100 : 80;
    if (op === 'insert' && table === 'catalog_categories' && !UUID.test(String(row.product_type_id || ''))) return 'Choose a valid product type.';
    if (op === 'insert' && (!String(row.name || '').trim() || !String(row.slug || '').trim())) return 'A name and slug are required.';
    if ('name' in row && (typeof row.name !== 'string' || row.name.trim().length < 1 || row.name.length > nameLimit)) return 'Catalogue name is invalid.';
    if ('slug' in row && (typeof row.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug))) return 'Catalogue slug is invalid.';
    if ('is_active' in row && typeof row.is_active !== 'boolean') return 'Catalogue visibility is invalid.';
    if ('sort_order' in row && (!Number.isInteger(Number(row.sort_order)) || Number(row.sort_order) < 0 || Number(row.sort_order) > 10000)) return 'Sort order is invalid.';
  }
  if (table === 'catalog_attribute_definitions') {
    if (op === 'insert' && !UUID.test(String(row.product_type_id || ''))) return 'Choose a valid product type.';
    if (op === 'insert' && (!String(row.key || '').trim() || !String(row.label || '').trim())) return 'Attribute key and label are required.';
    if ('key' in row && (typeof row.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(row.key))) return 'Attribute key must use lowercase letters, numbers, and underscores.';
    if ('label' in row && (typeof row.label !== 'string' || row.label.trim().length < 1 || row.label.length > 100)) return 'Attribute label is invalid.';
    if ('field_type' in row && !['text', 'number', 'select', 'boolean'].includes(row.field_type)) return 'Attribute field type is invalid.';
    if ('options' in row && (!Array.isArray(row.options) || row.options.length > 30 || row.options.some((value) => typeof value !== 'string' || value.trim().length < 1 || value.length > 80) || !withinJsonLimit(row.options, 4096))) return 'Attribute options are invalid.';
    if (row.field_type === 'select' && Array.isArray(row.options) && row.options.length === 0) return 'A select attribute needs at least one option.';
    for (const key of ['is_required', 'display_in_specs', 'is_active']) if (key in row && typeof row[key] !== 'boolean') return `${key} must be true or false.`;
    if ('sort_order' in row && (!Number.isInteger(Number(row.sort_order)) || Number(row.sort_order) < 0 || Number(row.sort_order) > 10000)) return 'Sort order is invalid.';
  }
  if (table === 'services') {
    if ('name' in row && (typeof row.name !== 'string' || row.name.trim().length < 1 || row.name.length > 160)) return 'Service name is invalid.';
    if ('description' in row && row.description != null && (typeof row.description !== 'string' || row.description.length > 6000)) return 'Service description is too long.';
    if ('price' in row && row.price != null && (!Number.isFinite(Number(row.price)) || Number(row.price) < 0 || Number(row.price) > 100_000_000)) return 'Service price is invalid.';
    if ('duration_minutes' in row && row.duration_minutes != null && (!Number.isInteger(Number(row.duration_minutes)) || Number(row.duration_minutes) < 1 || Number(row.duration_minutes) > 1440)) return 'Service duration is invalid.';
    if ('is_active' in row && typeof row.is_active !== 'boolean') return 'Service visibility is invalid.';
  }
  if (table === 'orders' && (!['processing', 'dispatched', 'cancelled'].includes(row.status))) return 'Order status must follow the payment and delivery workflow.';
  if (table === 'bookings' && !['pending', 'confirmed', 'completed', 'cancelled'].includes(row.status)) return 'Booking status is invalid.';
  if (table === 'international_requests' && !['pending', 'quoted', 'approved', 'declined', 'converted'].includes(row.status)) return 'Request status is invalid.';
  if (table === 'reviews') {
    if (op === 'insert' && (!Number.isInteger(Number(row.rating)) || Number(row.rating) < 1 || Number(row.rating) > 5)) return 'Rating must be from 1 to 5.';
    if ('customer_name' in row && row.customer_name != null && (typeof row.customer_name !== 'string' || row.customer_name.length > 120)) return 'Customer name is invalid.';
    if ('comment' in row && row.comment != null && (typeof row.comment !== 'string' || row.comment.length > 2000)) return 'Review comment is too long.';
    if ('product_id' in row && row.product_id != null && !UUID.test(String(row.product_id))) return 'Review product is invalid.';
  }
  if (table === 'store_settings') {
    if (op !== 'upsert' || row.id !== 'default') return 'Invalid settings row.';
    for (const key of ['settings', 'rules', 'goals']) {
      if (key in row && (!isPlainRecord(row[key]) || !withinJsonLimit(row[key]))) return `Invalid ${key} settings.`;
    }
    const settings = row.settings || {};
    for (const key of ['delivery_fee_default', 'min_order_free_delivery']) {
      if (key in settings && (!Number.isSafeInteger(Number(settings[key])) || Number(settings[key]) < 0 || Number(settings[key]) > 1_000_000_000_000)) {
        return `${key} must be a non-negative whole amount.`;
      }
    }
    if ('tax_rate' in settings && (!Number.isFinite(Number(settings.tax_rate)) || Number(settings.tax_rate) < 0 || Number(settings.tax_rate) > 100)) return 'Tax rate must be between 0 and 100.';
    if ('currency' in settings && settings.currency !== 'NGN') return 'Only NGN currency is supported.';
    for (const key of ['store_name', 'support_phone', 'support_whatsapp', 'whatsapp', 'support_email']) {
      if (key in settings && (typeof settings[key] !== 'string' || settings[key].length > (key === 'store_name' ? 120 : key.includes('email') ? 254 : 30))) return `${key} is invalid.`;
    }
    if (settings.support_email && !EMAIL_RE.test(settings.support_email)) return 'Support email is invalid.';
    const rules = row.rules || {};
    for (const key of ['auto_confirm_bookings', 'require_payment_before_dispatch', 'allow_guest_checkout']) {
      if (key in rules && typeof rules[key] !== 'boolean') return `${key} must be true or false.`;
    }
    if ('max_items_per_order' in rules && (!Number.isInteger(Number(rules.max_items_per_order)) || Number(rules.max_items_per_order) < 1 || Number(rules.max_items_per_order) > 50)) return 'Maximum items per order must be between 1 and 50.';
    if ('rider_assignment_mode' in rules && !['manual', 'auto'].includes(rules.rider_assignment_mode)) return 'Rider assignment mode is invalid.';
    const goals = row.goals || {};
    for (const key of ['daily_revenue', 'weekly_revenue', 'monthly_orders']) {
      if (key in goals && (!Number.isFinite(Number(goals[key])) || Number(goals[key]) < 0 || Number(goals[key]) > 1_000_000_000_000)) return `${key} is invalid.`;
    }
  }
  return null;
}

export function safeCataloguePath(path) {
  if (typeof path !== 'string' || path.includes('..') || path.includes('\\')) return false;
  return /^\/?catalogue\/[A-Za-z0-9._/-]+$/.test(path) && !path.split('/').includes('..');
}

export async function validProductImage(db, path) {
  if (path == null || path === '') return true;
  if (safeCataloguePath(path)) return true;
  try {
    const url = new URL(path);
    if (url.protocol === 'https:' && url.hostname === 'images.pexels.com' && url.pathname.startsWith('/photos/')) return true;
  } catch { /* storage path below */ }

  const match = /^products\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.exec(path);
  if (!match) return false;
  const expectedMime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[match[1].toLowerCase()];
  const { data, error } = await db.storage.from(PRODUCT_BUCKET).download(path);
  if (error || !data) return false;
  const bytes = Buffer.from(await data.arrayBuffer());
  return inspectImageBuffer(bytes, { expectedMime, maxBytes: MAX_IMAGE_BYTES }).ok;
}

async function validateProductCatalog(db, row, op) {
  if (op === 'insert' && !row.product_type_id) return { status: 400, error: 'Choose a product type before saving.' };
  if (!('product_type_id' in row) && !('category_id' in row) && !('attributes' in row)) return null;

  let typeId = row.product_type_id;
  if (!typeId && op === 'update') return { status: 400, error: 'Choose a product type before saving this product.' };
  const { data: type, error: typeError } = await db
    .from('catalog_product_types').select('id,is_active').eq('id', typeId).maybeSingle();
  if (typeError) return { status: 503, error: 'Flexible catalogue controls are not available yet. The catalogue migration must be applied first.' };
  if (!type) return { status: 400, error: 'Choose an existing product type.' };
  if (!type.is_active && (op === 'insert' || row.is_active === true)) return { status: 400, error: 'Choose an active product type for a published product.' };

  if (row.category_id) {
    const { data: category, error: categoryError } = await db
      .from('catalog_categories').select('id,product_type_id,is_active').eq('id', row.category_id).maybeSingle();
    if (categoryError) return { status: 503, error: 'Flexible catalogue controls are not available yet. The catalogue migration must be applied first.' };
    if (!category || category.product_type_id !== type.id) return { status: 400, error: 'Choose a category belonging to the selected product type.' };
    if (!category.is_active && (op === 'insert' || row.is_active === true)) return { status: 400, error: 'Choose an active category for a published product.' };
  }

  if ('attributes' in row) {
    const { data: definitions, error: definitionError } = await db
      .from('catalog_attribute_definitions')
      .select('key,label,field_type,options,is_required,is_active')
      .eq('product_type_id', type.id);
    if (definitionError) return { status: 503, error: 'Product attributes could not be checked. Please try again.' };
    const byKey = new Map((definitions || []).map((definition) => [definition.key, definition]));
    for (const key of Object.keys(row.attributes)) {
      const definition = byKey.get(key);
      if (!definition) return { status: 400, error: `The ${key} attribute is not defined for this product type.` };
      const value = row.attributes[key];
      if (value == null || value === '') continue;
      if (definition.field_type === 'text' && (typeof value !== 'string' || value.length > 1000)) return { status: 400, error: `${definition.label} must be text no longer than 1,000 characters.` };
      if (definition.field_type === 'number' && (!Number.isFinite(Number(value)) || String(value).length > 30)) return { status: 400, error: `${definition.label} must be a valid number.` };
      if (definition.field_type === 'boolean' && typeof value !== 'boolean') return { status: 400, error: `${definition.label} must be true or false.` };
      if (definition.field_type === 'select' && (typeof value !== 'string' || !(definition.options || []).includes(value))) return { status: 400, error: `Choose a valid ${definition.label} option.` };
    }
    for (const definition of definitions || []) {
      if (definition.is_required && definition.is_active && (row.attributes[definition.key] == null || row.attributes[definition.key] === '')) {
        return { status: 400, error: `${definition.label} is required for this product type.` };
      }
    }
  }
  return null;
}

async function catalog(res) {
  const db = needDb(res);
  if (!db) return;
  const [types, categories, attributes] = await Promise.all([
    db.from('catalog_product_types').select('*').order('sort_order').order('name').limit(200),
    db.from('catalog_categories').select('*').order('sort_order').order('name').limit(500),
    db.from('catalog_attribute_definitions').select('*').order('sort_order').order('label').limit(1000),
  ]);
  if (types.error || categories.error || attributes.error) {
    return json(res, 503, { error: 'Flexible catalogue controls are not available yet. The catalogue migration must be applied first.' });
  }
  return json(res, 200, {
    productTypes: types.data || [],
    categories: categories.data || [],
    attributeDefinitions: attributes.data || [],
  });
}

function needDb(res) {
  const db = getDb();
  if (!db) json(res, 503, { error: 'The server is missing its Supabase service-role configuration.' });
  return db;
}

async function login(req, res) {
  const cfg = adminConfig();
  if (!cfg.ok) return json(res, 503, { error: 'Admin login is not configured on the server yet.' });
  const db = needDb(res);
  if (!db) return;
  const keyHash = rateLimitKey(cfg.secret, 'admin-login', cfg.email);
  let limit;
  try { limit = await consumeRateLimit(db, keyHash, 5, 900); }
  catch { return json(res, 503, { error: 'Sign-in is temporarily unavailable.' }); }
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retry_after_seconds || 900));
    return json(res, 429, { error: 'Too many attempts. Try again later.' });
  }

  const body = readBody(req);
  const email = typeof body.email === 'string' && body.email.length <= 254 ? body.email : '';
  const password = typeof body.password === 'string' && body.password.length <= 1024 ? body.password : '';
  // Evaluate both comparisons so timing does not reveal which one failed.
  const emailOk = safeEqual(email.trim().toLowerCase(), cfg.email);
  const passOk = safeEqual(password, cfg.password);
  if (!(emailOk && passOk)) {
    await sleep(600);
    return json(res, 401, { error: 'Incorrect email or password.' });
  }

  try { await clearRateLimit(db, keyHash); }
  catch { return json(res, 503, { error: 'Sign-in is temporarily unavailable.' }); }
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
    const columns = table === 'rider_jobs'
      ? 'id,order_id,rider_id,status,delivery_photo_path,created_at,updated_at'
      : '*';
    const { data, error } = await db.from(table).select(columns).order(sortCol, { ascending: false }).limit(300);
    return { key, table, data, error };
  }));
  const failed = results.find((r) => r.error);
  if (failed) return json(res, 500, { error: `Dashboard data could not be loaded (${failed.table}).` });
  return json(res, 200, Object.fromEntries(results.map((r) => [r.key, r.data || []])));
}

async function reviews(res) {
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.from('reviews').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) return json(res, 500, { error: 'Reviews could not be loaded.' });
  return json(res, 200, { reviews: data || [] });
}

async function settings(res) {
  const db = needDb(res);
  if (!db) return;
  const { data, error } = await db.from('store_settings').select('settings, rules, goals').eq('id', 'default').maybeSingle();
  if (error) return json(res, 500, { error: 'Store settings could not be loaded.' });
  return json(res, 200, { row: data || null });
}

async function auditLog(req, res) {
  const db = needDb(res);
  if (!db) return;
  const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 500);
  const { data, error } = await db.from('audit_log').select('id,actor_email,action,table_name,record_id,metadata,created_at').order('created_at', { ascending: false }).limit(limit);
  if (error) return json(res, 500, { error: 'Audit history could not be loaded.' });
  return json(res, 200, { audit: data || [] });
}

async function mutate(req, res) {
  const { table, op, id, values } = readBody(req);
  const needsValues = op !== 'delete';
  const needsId = op === 'update' || op === 'delete';
  if (needsId && !(typeof id === 'string' && UUID.test(id))) return json(res, 400, { error: 'A valid id is required.' });
  if (needsValues && (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length > 40)) {
    return json(res, 400, { error: 'Invalid values.' });
  }
  const row = needsValues ? { ...values } : null;
  const validationError = MUTABLE_FIELDS[table]?.[op]
    ? (op === 'delete' ? null : validateMutation(table, op, row))
    : 'That change is not allowed.';
  if (validationError) return json(res, 400, { error: validationError });

  if (table === 'products' && row && 'price' in row) {
    const kobo = toKobo(row.price);
    if (kobo == null) return json(res, 400, { error: 'Product price is invalid.' });
    row.price_kobo = kobo;
    delete row.price;
  }
  const db = needDb(res);
  if (!db) return;

  if (table === 'store_settings' && row) row.updated_at = new Date().toISOString();
  if (op === 'update' && row?.is_active === false && (table === 'catalog_product_types' || table === 'catalog_categories')) {
    const foreignKey = table === 'catalog_product_types' ? 'product_type_id' : 'category_id';
    const { count, error } = await db.from('products').select('id', { count: 'exact', head: true })
      .eq(foreignKey, id).eq('is_active', true);
    if (error) return json(res, 503, { error: 'Active products could not be checked. Try again before archiving.' });
    if (count > 0) return json(res, 409, { error: 'Move or hide active products before archiving this catalogue item.' });
  }
  if (table === 'products' && row) {
    const catalogError = await validateProductCatalog(db, row, op);
    if (catalogError) return json(res, catalogError.status, { error: catalogError.error });
  }
  if (table === 'products' && row && 'image_path' in row && !(await validProductImage(db, row.image_path))) {
    return json(res, 400, { error: 'Product image must be a valid catalogue or verified upload image.' });
  }
  if (table === 'products' && row && 'gallery_paths' in row) {
    for (const path of row.gallery_paths) {
      if (!(await validProductImage(db, path))) return json(res, 400, { error: 'Every secondary image must be a valid catalogue or verified upload image.' });
    }
  }

  if (table === 'orders') {
    const { data, error } = await db.rpc('advance_order_status', { p_order_id: id, p_new_status: row.status });
    if (error) return json(res, 500, { error: 'Order status could not be updated.' });
    if (!data || data.ok !== true) {
      const messages = {
        invalid_transition: 'That order status change is not allowed.',
        payment_not_successful: 'The order cannot be approved until its payment is successful.',
        order_not_found: 'Order not found.',
      };
      return json(res, 409, { error: messages[data?.error] || 'Order status could not be updated.' });
    }
    return json(res, 200, { ok: true, status: data.status });
  }

  let query = db.from(table);
  if (op === 'insert') query = query.insert(row);
  else if (op === 'upsert') query = query.upsert(row);
  else if (op === 'update') query = query.update(row).eq('id', id);
  else query = query.delete().eq('id', id);

  const { data, error } = await query.select('id');
  if (error) {
    const status = error.code === '23505' ? 409 : 400;
    return json(res, status, { error: error.code === '23505' ? 'That value already exists (duplicate slug?).' : 'That change could not be saved.' });
  }
  if ((op === 'update' || op === 'delete') && !data?.length) return json(res, 404, { error: 'Nothing matched that id.' });
  return json(res, 200, { ok: true, id: data?.[0]?.id || null });
}

async function uploadUrl(req, res) {
  const { contentType, size } = readBody(req);
  const ext = IMAGE_EXT[contentType];
  if (!ext) return json(res, 400, { error: 'Use a JPG, PNG or WebP image.' });
  if (!Number.isInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) return json(res, 400, { error: 'Image must be 5 MB or smaller.' });
  const db = needDb(res);
  if (!db) return;
  const path = `products/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await db.storage.from(PRODUCT_BUCKET).createSignedUploadUrl(path);
  if (error) return json(res, 500, { error: 'Image upload could not be prepared.' });
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
  if (error) return json(res, 500, { error: 'Image could not be removed.' });
  return json(res, 200, { ok: true });
}

async function verifyUpload(req, res) {
  const { path = '' } = readBody(req);
  if (typeof path !== 'string' || !/^products\/[A-Za-z0-9._-]+\.(jpg|png|webp)$/i.test(path)) {
    return json(res, 400, { error: 'Invalid product image path.' });
  }
  const db = needDb(res);
  if (!db) return;
  if (!(await validProductImage(db, path))) {
    await db.storage.from(PRODUCT_BUCKET).remove([path]).catch(() => {});
    return json(res, 400, { error: 'The upload is not a valid JPG, PNG or WebP image under 5 MB.' });
  }
  return json(res, 200, { ok: true, path });
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
  try {
    const r = await fetch('https://api.paystack.co' + path, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const out = await r.json().catch(() => null);
    if (!out) { json(res, 502, { error: 'Could not reach Paystack. Please try again.' }); return null; }
    return out;
  } catch {
    json(res, 502, { error: 'Could not reach Paystack. Please try again.' });
    return null;
  }
}

async function publicRateLimit(res, db, scope, identifier, limit) {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const keyHash = rateLimitKey(secret, scope, identifier);
    const result = await consumeRateLimit(db, keyHash, limit, 900);
    if (result.allowed) return true;
    res.setHeader('Retry-After', String(result.retry_after_seconds || 900));
    json(res, 429, { error: 'Too many payment attempts. Please wait and try again.' });
    return false;
  } catch {
    json(res, 503, { error: 'Payment service is temporarily unavailable.' });
    return false;
  }
}

async function payInit(req, res) {
  const db = needDb(res);
  if (!db) return;
  const body = readBody(req);
  const reference = typeof body.reference === 'string' ? body.reference : '';
  const email = typeof body.email === 'string' && body.email.length <= 254 ? body.email : '';
  if (!PAY_REF.test(reference)) return json(res, 400, { error: 'Invalid payment reference.' });

  const { data: payment, error } = await db
    .from('payments')
    .select('id, order_id, status, payment_method, amount_kobo, currency, reference')
    .eq('reference', reference)
    .maybeSingle();
  if (error || !payment) return json(res, 404, { error: 'Payment reference not found.' });
  if (payment.payment_method !== 'paystack') return json(res, 409, { error: 'This payment method cannot be paid through Paystack.' });
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
  if (!(await publicRateLimit(res, db, 'pay-init', reference, 5))) return;

  const origin = trustedRequestOrigin(req);
  if (!origin) return json(res, 403, { error: 'Request rejected.' });
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
    return json(res, 502, { error: 'Paystack could not start the transaction.' });
  }
  let authorizationUrl;
  try {
    authorizationUrl = new URL(out.data.authorization_url);
    if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== 'checkout.paystack.com') throw new Error('Untrusted checkout host');
  } catch {
    return json(res, 502, { error: 'Paystack returned an invalid checkout link.' });
  }
  return json(res, 200, {
    ok: true,
    authorization_url: authorizationUrl.toString(),
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
  const transactionId = Number(out.data?.id);
  const amount = Number(out.data?.amount);
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0
      || !Number.isSafeInteger(amount) || amount < 0
      || out.data?.reference !== reference || out.data?.currency !== 'NGN') {
    return { ok: false, error: 'Paystack returned transaction details that could not be verified.' };
  }
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ transactionId, reference, amount, currency: 'NGN' })).digest('hex');
  const { data: result, error: rpcError } = await db.rpc('mark_payment_successful_from_webhook', {
    p_reference: reference,
    p_amount_kobo: amount,
    p_provider_response: { channel: out.data.channel, paid_at: out.data.paid_at, gateway_response: out.data.gateway_response },
    p_transaction_id: transactionId,
    p_payload_sha256: payloadHash,
  });
  if (rpcError) return { ok: false, error: 'Could not record the payment. Please contact support.' };
  if (result && result.ok === false) return { ok: false, error: result.error || 'Payment could not be recorded.' };
  return { ok: true, status: result?.status || 'recorded' };
}

async function payVerify(req, res) {
  const db = needDb(res);
  if (!db) return;
  const body = readBody(req);
  const reference = typeof body.reference === 'string' ? body.reference : '';
  if (!PAY_REF.test(reference)) return json(res, 400, { error: 'Invalid payment reference.' });
  if (!(await publicRateLimit(res, db, 'pay-verify', reference, 30))) return;
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
  if (error) return json(res, 500, { error: 'Transfer status could not be updated.' });
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

const ROUTES = {
  login: { method: 'POST', public: true, run: login },
  logout: { method: 'POST', public: true, run: logout },
  session: { method: 'GET', public: true, run: session },
  data: { method: 'GET', run: (req, res) => snapshot(res) },
  catalog: { method: 'GET', run: (req, res) => catalog(res) },
  reviews: { method: 'GET', run: (req, res) => reviews(res) },
  settings: { method: 'GET', run: (req, res) => settings(res) },
  audit: { method: 'GET', run: auditLog },
  mutate: { method: 'POST', run: mutate },
  'upload-url': { method: 'POST', run: uploadUrl },
  'remove-image': { method: 'POST', run: removeImage },
  'verify-upload': { method: 'POST', run: verifyUpload },
  'pay-init': { method: 'POST', public: true, run: payInit },
  'pay-verify': { method: 'POST', public: true, run: payVerify },
  'confirm-transfer': { method: 'POST', run: confirmTransfer },
};

export default async function handler(req, res) {
  const route = ROUTES[req.query?.action];
  if (!route) return json(res, 404, { error: 'Not found.' });
  if (req.method !== route.method) {
    res.setHeader('Allow', route.method);
    return json(res, 405, { error: 'Method not allowed.' });
  }
  if (req.method === 'POST') {
    if (!isSameOriginRequest(req)) return json(res, 403, { error: 'Request rejected.' });
    try { req._rhBody = readJsonBody(req, { maxBytes: 32 * 1024 }); }
    catch (err) { return json(res, err.status || 400, { error: err.message || 'Invalid request body.' }); }
  }
  if (!route.public && !requireAdmin(req, res, { mutating: route.method !== 'GET' })) return undefined;
  try {
    return await route.run(req, res);
  } catch (err) {
    console.error('[admin api]', req.query?.action, err);
    return json(res, 500, { error: 'Something went wrong on the server.' });
  }
}
