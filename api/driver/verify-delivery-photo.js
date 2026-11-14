import crypto from 'node:crypto';
import { json } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';
import { inspectImageBuffer } from '../_lib/imageValidation.js';
import { isSameOriginRequest, readJsonBody } from '../_lib/request.js';

const BUCKET = 'delivery-evidence';
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSION_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()] ?? req?.headers?.[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function fail(res, status, error) {
  return json(res, status, { error });
}

async function removeInvalidObject(db, path) {
  try { await db.storage.from(BUCKET).remove([path]); } catch { /* orphan cleanup is best effort */ }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Method not allowed.');
  }
  if (!isSameOriginRequest(req)) return fail(res, 403, 'Request rejected.');

  let body;
  try { body = readJsonBody(req, { maxBytes: 8 * 1024 }); }
  catch (err) { return fail(res, err.status || 400, err.message || 'Invalid request body.'); }

  const jobId = typeof body.job_id === 'string' ? body.job_id : '';
  const path = typeof body.path === 'string' ? body.path : '';
  if (!UUID.test(jobId) || !new RegExp(`^jobs/${jobId}/evidence-\\d{13}\\.(jpg|png|webp)$`, 'i').test(path)) {
    return fail(res, 400, 'Invalid delivery-photo reference.');
  }

  const authorization = header(req, 'authorization');
  const tokenMatch = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/.exec(authorization);
  if (!tokenMatch) return fail(res, 401, 'Sign in to verify this delivery photo.');

  const db = getDb();
  if (!db) return fail(res, 503, 'Delivery-photo verification is unavailable.');
  const { data: authData, error: authError } = await db.auth.getUser(tokenMatch[1]);
  if (authError || !authData?.user?.id) return fail(res, 401, 'Your driver session has expired. Sign in again.');
  const appMeta = authData.user.app_metadata || {};
  const hasDriverRole = ['driver', 'rider'].includes(appMeta.role)
    || (Array.isArray(appMeta.roles) && appMeta.roles.some((role) => ['driver', 'rider'].includes(role)));
  const allowedEmails = new Set(String(process.env.DRIVER_EMAILS || process.env.VITE_DRIVER_EMAILS || '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (!hasDriverRole && !allowedEmails.has(String(authData.user.email || '').trim().toLowerCase())) {
    return fail(res, 403, 'This account is not approved for driver actions.');
  }

  const { data: job, error: jobError } = await db.from('rider_jobs')
    .select('id,rider_id,status').eq('id', jobId).maybeSingle();
  if (jobError) return fail(res, 503, 'The assigned job could not be verified.');
  if (!job || job.rider_id !== authData.user.id) return fail(res, 403, 'This job is not assigned to your account.');
  if (job.status !== 'in_transit') return fail(res, 409, 'The job must be in transit to attach delivery evidence.');

  const fileName = path.split('/').at(-1);
  const { data: entries, error: listError } = await db.storage.from(BUCKET).list(`jobs/${jobId}`, { limit: 100, search: fileName });
  if (listError) return fail(res, 503, 'The uploaded photo could not be inspected.');
  const entry = (entries || []).find((candidate) => candidate.name === fileName);
  const declaredSize = Number(entry?.metadata?.size);
  const extension = path.split('.').at(-1).toLowerCase();
  if (!entry || !Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_BYTES
      || entry.metadata?.mimetype !== EXTENSION_MIME[extension]) {
    await removeInvalidObject(db, path);
    return fail(res, 400, 'Use a valid JPG, PNG or WebP photo no larger than 8 MB.');
  }

  const { data: file, error: downloadError } = await db.storage.from(BUCKET).download(path);
  if (downloadError || !file) return fail(res, 503, 'The uploaded photo could not be inspected.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const inspection = inspectImageBuffer(bytes, { expectedMime: EXTENSION_MIME[extension], maxBytes: MAX_BYTES });
  if (!inspection.ok || bytes.length !== declaredSize) {
    await removeInvalidObject(db, path);
    return fail(res, 400, 'The photo is not a valid supported image or exceeds the 8 MB limit.');
  }

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const { error: insertError } = await db.from('verified_delivery_evidence').insert({
    job_id: jobId,
    path,
    verified_by: authData.user.id,
    sha256,
  });
  if (insertError) {
    await removeInvalidObject(db, path);
    return fail(res, 409, 'This photo could not be registered for the job. Upload it again.');
  }

  return json(res, 200, { ok: true, job_id: jobId, path, mime: inspection.mime, bytes: inspection.bytes });
}
