import { requireStaffPermission } from '../_lib/authorization.js';

function sendError(res, error) {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error('RAW HAIRS COD eligibility API error:', error.message);
  return res.status(status).json({
    error: status >= 500 ? 'Unable to update COD eligibility right now.' : error.message,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const { staff, sql } = await requireStaffPermission(req, 'cod:manage');

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT approval.id, approval.customer_id, customer.display_name,
          customer.email, customer.phone, approval.is_active, approval.reason,
          approval.approved_at, approval.revoked_at
        FROM customer_cod_approvals AS approval
        JOIN customers AS customer ON customer.id = approval.customer_id
        ORDER BY approval.approved_at DESC
        LIMIT 200
      `;
      return res.status(200).json({ approvals: rows });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const customerId = typeof body.customerId === 'string' ? body.customerId.trim() : '';
    const approved = body.approved;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      return res.status(400).json({ error: 'A valid customer ID is required.' });
    }
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved must be true or false.' });
    }
    if (approved && reason.length < 3) {
      return res.status(400).json({ error: 'Provide a reason for approving COD access.' });
    }

    const customerRows = await sql`SELECT id FROM customers WHERE id = ${customerId} LIMIT 1`;
    if (!customerRows.length) return res.status(404).json({ error: 'Customer not found.' });

    const rows = await sql`
      WITH changed AS (
        INSERT INTO customer_cod_approvals (customer_id, is_active, approved_by, reason, approved_at, revoked_at)
        VALUES (
          ${customerId}, ${approved}, ${staff.id}, ${reason || 'COD access revoked'},
          now(), CASE WHEN ${approved} THEN NULL ELSE now() END
        )
        ON CONFLICT (customer_id) DO UPDATE SET
          is_active = EXCLUDED.is_active,
          approved_by = CASE WHEN EXCLUDED.is_active THEN EXCLUDED.approved_by ELSE customer_cod_approvals.approved_by END,
          reason = EXCLUDED.reason,
          approved_at = CASE WHEN EXCLUDED.is_active THEN now() ELSE customer_cod_approvals.approved_at END,
          revoked_at = CASE WHEN EXCLUDED.is_active THEN NULL ELSE now() END
        RETURNING id, customer_id, is_active, reason, approved_at, revoked_at
      ), audit AS (
        INSERT INTO audit_events (actor_type, actor_id, action, target_type, target_id, after_state)
        SELECT 'staff', ${staff.id}::text,
          CASE WHEN changed.is_active THEN 'customer_cod_approved' ELSE 'customer_cod_revoked' END,
          'customer', changed.customer_id::text,
          jsonb_build_object('is_active', changed.is_active, 'reason', changed.reason)
        FROM changed
        RETURNING id
      )
      SELECT changed.* FROM changed
    `;
    return res.status(200).json({ approval: rows[0] });
  } catch (error) {
    return sendError(res, error);
  }
}