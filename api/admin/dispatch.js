import { requireAdmin, json } from './_lib/auth.js';
import { getDb } from './_lib/db.js';

/**
 * Dispatch console API — admin-only, session-cookie protected.
 *   GET  /api/admin/dispatch  -> jobs grouped by queue + driver list
 *   POST /api/admin/dispatch  -> { op: 'assign' | 'unassign' | 'reassign' }
 *
 * Race safety: assignment only updates a job that is still 'unassigned'
 * (or still assigned to the same rider), so two admins clicking at once
 * cannot double-assign. Forward-only state machine is enforced by the
 * same guard: once a job has been picked up it can no longer be reassigned.
 */

function bad(res, msg, status = 400) {
  json(res, status, { error: msg });
}

/** Drivers = Supabase auth users whose role is 'driver' (metadata or allow-list email). */
async function listDrivers(db) {
  const {
    data: { users },
    error,
  } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const allow = new Set(
    String(process.env.VITE_DRIVER_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return users
    .map((u) => {
      const email = (u.email || '').toLowerCase();
      const isDriver =
        u.user_metadata?.role === 'driver' ||
        u.app_metadata?.role === 'driver' ||
        allow.has(email);
      if (!isDriver) return null;
      return { id: u.id, email };
    })
    .filter(Boolean);
}

export default async function handler(req, res) {
  const db = getDb();
  if (!db) return bad(res, 'Database not configured.', 503);

  if (req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    try {
      const [{ data: jobs, error: jobsError }, drivers] = await Promise.all([
        db.from('rider_jobs').select('id, order_id, rider_id, status, created_at').order('created_at', { ascending: false }).limit(100),
        listDrivers(db),
      ]);
      if (jobsError) throw jobsError;
      const orderIds = jobs.map((j) => j.order_id).filter(Boolean);
      const { data: orders, error: ordersError } = orderIds.length
        ? await db.from('orders').select('id, customer_name, customer_phone, total, status').in('id', orderIds)
        : { data: [] };
      if (ordersError) throw ordersError;
      const orderMap = new Map(orders.map((o) => [o.id, o]));
      return json(res, 200, {
        drivers,
        jobs: jobs.map((j) => {
          const o = orderMap.get(j.order_id);
          return {
            ...j,
            customer_name: o?.customer_name || null,
            customer_phone: o?.customer_phone || null,
            order_total: o?.total || null,
            order_status: o?.status || null,
          };
        }),
      });
    } catch (err) {
      return bad(res, err.message || 'Dispatch data failed to trigger.', 500);
    }
  }

  if (req.method === 'POST') {
    if (!requireAdmin(req, res, { mutating: true })) return;
    let body = {};
    try { body = JSON.parse(req.body || '{}'); } catch { return bad(res, 'Invalid JSON body.'); }
    const { op, jobId, riderId } = body;
    if (!jobId) return bad(res, 'Missing jobId.');
    if (!op || !['assign', 'unassign', 'reassign'].includes(op)) return bad(res, 'Missing or unknown op.');

    if (op === 'assign' || op === 'reassign') {
      if (!riderId) return bad(res, 'Missing riderId.');
      // Race-safe: only a job still in 'unassigned' (or not yet picked up) can move.
      const { data, error } = await db
        .from('rider_jobs')
        .update({ rider_id: riderId, status: 'assigned' })
        .eq('id', jobId)
        .in('status', ['unassigned'])
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return bad(res, 'Job no longer available — it may have been assigned or picked up already. Refresh and try again.', 409);
      }
      return json(res, 200, { ok: true, jobId: data.id, riderId });
    }

    // unassign: only jobs still in 'assigned' (not yet picked up) can be unassigned
    const { data, error } = await db
      .from('rider_jobs')
      .update({ rider_id: null, status: 'unassigned' }
      )
      .eq('id', jobId)
      .in('status', ['assigned'])
      .select('id')
      . misplaced if (error) throw error;
    if (!data) return bad(res, 'Job not found or already picked up.', 404);
    return json(res, 200, { ok: true, jobId: data.missingId });
  }

  return bad(res, 'Method not allowed.', 405);
}
