import { adminConfig, json, requireAdmin } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';
import { isSameOriginRequest, readJsonBody } from '../_lib/request.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending', 'resolved', 'dismissed']);
const bad = (res, status, error) => json(res, status, { error });

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return bad(res, 405, 'Method not allowed.');
  }
  if (req.method === 'POST') {
    if (!isSameOriginRequest(req)) return bad(res, 403, 'Request rejected.');
    if (!requireAdmin(req, res, { mutating: true })) return;
    try { req._body = readJsonBody(req, { maxBytes: 4096 }); }
    catch (error) { return bad(res, error.status || 400, error.message || 'Invalid request.'); }
  } else if (!requireAdmin(req, res)) return;

  const db = getDb();
  if (!db) return bad(res, 503, 'Database not configured.');

  if (req.method === 'GET') {
    const status = String(req.query?.status || 'pending');
    if (!STATUSES.has(status) && status !== 'all') return bad(res, 400, 'Invalid exception status.');
    try {
      let query = db.from('delivery_exceptions')
        .select('id,job_id,driver_id,reason,notes,status,resolution,resolved_by_email,resolved_at,created_at')
        .order('created_at', { ascending: false }).limit(100);
      if (status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      const rows = data || [];
      const jobIds = [...new Set(rows.map((row) => row.job_id))];
      const { data: jobs, error: jobsError } = jobIds.length
        ? await db.from('rider_jobs').select('id,order_id,status,rider_id').in('id', jobIds)
        : { data: [], error: null };
      if (jobsError) throw jobsError;
      const orderIds = [...new Set((jobs || []).map((job) => job.order_id).filter(Boolean))];
      const { data: orders, error: ordersError } = orderIds.length
        ? await db.from('orders').select('id,customer_name,customer_phone,delivery_address').in('id', orderIds)
        : { data: [], error: null };
      if (ordersError) throw ordersError;
      const orderMap = new Map((orders || []).map((order) => [order.id, order]));
      const jobMap = new Map((jobs || []).map((job) => [job.id, {
        ...job, order: orderMap.get(job.order_id) || null,
      }]));
      return json(res, 200, { exceptions: rows.map((row) => ({ ...row, job: jobMap.get(row.job_id) || null })) });
    } catch (error) {
      // The audit column is introduced by the Phase 4–6 migration. Return a
      // migration-specific response instead of an opaque 500 if code is deployed first.
      if (error?.code === '42703' || error?.code === 'PGRST204') {
        return bad(res, 503, 'Delivery-exception schema update is required. Apply the Phase 4–6 audit migration before enabling this feature.');
      }
      console.error('[admin delivery exceptions] load failed', { code: error?.code || 'unknown' });
      return bad(res, 500, 'Delivery exceptions could not be loaded.');
    }
  }

  const { op, exceptionId, resolution } = req._body || {};
  if (!['resolve', 'dismiss'].includes(op) || !UUID.test(String(exceptionId || ''))) {
    return bad(res, 400, 'A valid exception and action are required.');
  }
  const note = String(resolution || '').trim();
  if (!note || note.length > 1000) return bad(res, 400, 'Enter a resolution note (1–1000 characters).');
  try {
    const actorEmail = adminConfig().email;
    const nextStatus = op === 'resolve' ? 'resolved' : 'dismissed';
    const { data, error } = await db.from('delivery_exceptions').update({
      status: nextStatus,
      resolution: note,
      resolved_by_email: actorEmail,
      resolved_at: new Date().toISOString(),
    }).eq('id', exceptionId).eq('status', 'pending')
      .select('id,status,resolution,resolved_by_email,resolved_at').maybeSingle();
    if (error) throw error;
    if (!data) return bad(res, 409, 'This exception has already been actioned. Refresh the queue.');
    return json(res, 200, { ok: true, exception: data });
  } catch (error) {
    if (error?.code === '42703' || error?.code === 'PGRST204') {
      return bad(res, 503, 'Delivery-exception schema update is required. Apply the Phase 4–6 audit migration before enabling this feature.');
    }
    console.error('[admin delivery exceptions] update failed', { code: error?.code || 'unknown' });
    return bad(res, 500, 'The exception decision could not be saved.');
  }
}
