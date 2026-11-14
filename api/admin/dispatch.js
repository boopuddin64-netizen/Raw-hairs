import { requireAdmin, json } from '../_lib/auth.js';
import { getDb } from '../_lib/db.js';
import { isSameOriginRequest, readJsonBody } from '../_lib/request.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVER_PAGE_SIZE = 200;
const MAX_DRIVER_PAGES = 20;

function bad(res, msg, status = 400) {
  return json(res, status, { error: msg });
}

/** Drivers are selected only by trusted app_metadata role or a server allowlist. */
async function listDrivers(db) {
  const allow = new Set(
    String(process.env.DRIVER_EMAILS || process.env.VITE_DRIVER_EMAILS || '')
      .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  const users = [];
  for (let page = 1; page <= MAX_DRIVER_PAGES; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: DRIVER_PAGE_SIZE });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < DRIVER_PAGE_SIZE) break;
  }
  return users.map((user) => {
    const email = String(user.email || '').trim().toLowerCase();
    const trustedRole = ['driver', 'rider'].includes(user.app_metadata?.role)
      || (Array.isArray(user.app_metadata?.roles) && user.app_metadata.roles.some((role) => ['driver', 'rider'].includes(role)));
    return trustedRole || allow.has(email) ? { id: user.id, email } : null;
  }).filter(Boolean);
}

const RPC_ERRORS = {
  owner_only: ['Only the owner can manage dispatch.', 403],
  job_not_found: ['Job not found.', 404],
  rider_not_found: ['The selected driver account was not found.', 400],
  job_in_progress: ['This job is already assigned or in progress.', 409],
  invalid_state: ['This job is not in a state that allows a new delivery code.', 409],
  otp_still_valid: ['The current delivery code is still active.', 409],
};

function rpcError(res, code, fallback) {
  const [message, status] = RPC_ERRORS[code] || [fallback, 400];
  return bad(res, message, status);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return bad(res, 'Method not allowed.', 405);
  }
  if (req.method === 'POST') {
    if (!isSameOriginRequest(req)) return bad(res, 'Request rejected.', 403);
    if (!requireAdmin(req, res, { mutating: true })) return;
    try { req._rhBody = readJsonBody(req, { maxBytes: 8 * 1024 }); }
    catch (err) { return bad(res, err.message || 'Invalid request body.', err.status || 400); }
  } else if (!requireAdmin(req, res)) {
    return;
  }

  const db = getDb();
  if (!db) return bad(res, 'Database not configured.', 503);

  if (req.method === 'GET') {
    try {
      const [{ data: jobs, error: jobsError }, drivers] = await Promise.all([
        db.from('rider_jobs').select('id,order_id,rider_id,status,delivery_photo_path,created_at,updated_at')
          .order('created_at', { ascending: false }).limit(100),
        listDrivers(db),
      ]);
      if (jobsError) throw jobsError;
      const jobIds = jobs.map((job) => job.id);
      const orderIds = jobs.map((job) => job.order_id).filter(Boolean);
      const [{ data: controls, error: controlsError }, { data: orders, error: ordersError }] = await Promise.all([
        jobIds.length
          ? db.from('rider_otp_controls').select('job_id,expires_at,failed_attempts').in('job_id', jobIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length
          ? db.from('orders').select('id,customer_name,customer_phone,total,status').in('id', orderIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (controlsError) throw controlsError;
      if (ordersError) throw ordersError;
      const controlMap = new Map((controls || []).map((control) => [control.job_id, control]));
      const orderMap = new Map((orders || []).map((order) => [order.id, order]));
      return json(res, 200, {
        drivers,
        jobs: jobs.map((job) => {
          const order = orderMap.get(job.order_id);
          const control = controlMap.get(job.id);
          return {
            ...job,
            customer_name: order?.customer_name || null,
            customer_phone: order?.customer_phone || null,
            order_total: order?.total || null,
            order_status: order?.status || null,
            otp_expires_at: control?.expires_at || null,
            otp_failed_attempts: control?.failed_attempts || 0,
          };
        }),
      });
    } catch (err) {
      console.error('[dispatch api] load failed', err);
      return bad(res, 'Dispatch data could not be loaded.', 500);
    }
  }

  const body = req._rhBody || {};
  const { op, jobId, riderId } = body;
  if (!UUID.test(String(jobId || ''))) return bad(res, 'A valid job id is required.');
  if (!['assign', 'unassign', 'reissue-otp'].includes(op)) return bad(res, 'Unknown dispatch action.');

  try {
    if (op === 'assign') {
      if (!UUID.test(String(riderId || ''))) return bad(res, 'A valid driver is required.');
      const drivers = await listDrivers(db);
      const driver = drivers.find((item) => item.id === riderId);
      if (!driver) return bad(res, 'The selected account is not an approved driver.', 403);
      const { data, error } = await db.rpc('assign_rider_job', { p_job_id: jobId, p_rider_email: driver.email });
      if (error) throw error;
      if (!data?.ok) return rpcError(res, data?.error, 'Could not assign the driver.');
      return json(res, 200, { ok: true, jobId, riderId: driver.id, otp: data.otp });
    }

    if (op === 'unassign') {
      const { data, error } = await db.rpc('unassign_rider_job', { p_job_id: jobId });
      if (error) throw error;
      if (!data?.ok) return rpcError(res, data?.error, 'Could not return the job to the queue.');
      return json(res, 200, { ok: true, jobId });
    }

    const { data, error } = await db.rpc('reissue_delivery_otp', { p_job_id: jobId });
    if (error) throw error;
    if (!data?.ok) return rpcError(res, data?.error, 'Could not issue a new delivery code.');
    return json(res, 200, { ok: true, jobId, otp: data.otp, reissued: true });
  } catch (err) {
    console.error('[dispatch api] mutation failed', err);
    return bad(res, 'The dispatch change could not be saved.', 500);
  }
}
