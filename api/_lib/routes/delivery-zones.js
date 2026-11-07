import { requireStaffPermission } from '../authorization.js';

function sendError(res, error) {
  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error('RAW HAIRS delivery zones API error:', error.message);
  return res.status(status).json({ error: status >= 500 ? 'Unable to manage delivery zones right now.' : error.message });
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const { staff, sql } = await requireStaffPermission(req, 'delivery-zones:manage');
    if (req.method === 'GET') {
      const zones = await sql`
        SELECT id, name, country_code, state_name, city, fee_kobo, cod_enabled, is_active, created_at, updated_at
        FROM delivery_zones ORDER BY country_code, state_name, city, name
      `;
      return res.status(200).json({ zones });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (req.method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
      const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : 'NG';
      const stateName = typeof body.stateName === 'string' ? body.stateName.trim().slice(0, 120) : null;
      const city = typeof body.city === 'string' ? body.city.trim().slice(0, 120) : null;
      const feeKobo = Number(body.feeKobo);
      const codEnabled = body.codEnabled === true;
      if (!name || !/^[A-Z]{2}$/.test(countryCode) || !Number.isSafeInteger(feeKobo) || feeKobo < 0) {
        return res.status(400).json({ error: 'Provide a zone name, ISO country code and non-negative delivery fee in kobo.' });
      }
      const rows = await sql`
        INSERT INTO delivery_zones (name, country_code, state_name, city, fee_kobo, cod_enabled)
        VALUES (${name}, ${countryCode}, ${stateName}, ${city}, ${feeKobo}, ${codEnabled})
        RETURNING id, name, country_code, state_name, city, fee_kobo, cod_enabled, is_active
      `;
      await sql`
        INSERT INTO audit_events (actor_type, actor_id, action, target_type, target_id, after_state)
        VALUES ('staff', ${staff.id}::text, 'delivery_zone_created', 'delivery_zone', ${rows[0].id}::text,
          jsonb_build_object('name', ${name}, 'country_code', ${countryCode}, 'fee_kobo', ${feeKobo}, 'cod_enabled', ${codEnabled}))
      `;
      return res.status(201).json({ zone: rows[0] });
    }

    const zoneId = typeof body.zoneId === 'string' ? body.zoneId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(zoneId)) {
      return res.status(400).json({ error: 'A valid delivery zone ID is required.' });
    }
    if (typeof body.codEnabled !== 'boolean' && typeof body.isActive !== 'boolean' && body.feeKobo === undefined) {
      return res.status(400).json({ error: 'Provide codEnabled, isActive or feeKobo to update.' });
    }
    const feeKobo = body.feeKobo === undefined ? null : Number(body.feeKobo);
    if (feeKobo !== null && (!Number.isSafeInteger(feeKobo) || feeKobo < 0)) {
      return res.status(400).json({ error: 'feeKobo must be a non-negative integer.' });
    }
    const codEnabled = typeof body.codEnabled === 'boolean' ? body.codEnabled : null;
    const isActive = typeof body.isActive === 'boolean' ? body.isActive : null;
    const rows = await sql`
      UPDATE delivery_zones SET
        cod_enabled = COALESCE(${codEnabled}, cod_enabled),
        is_active = COALESCE(${isActive}, is_active),
        fee_kobo = COALESCE(${feeKobo}, fee_kobo),
        updated_at = now()
      WHERE id = ${zoneId}
      RETURNING id, name, country_code, state_name, city, fee_kobo, cod_enabled, is_active
    `;
    if (!rows.length) return res.status(404).json({ error: 'Delivery zone not found.' });
    await sql`
      INSERT INTO audit_events (actor_type, actor_id, action, target_type, target_id, after_state)
      VALUES ('staff', ${staff.id}::text, 'delivery_zone_updated', 'delivery_zone', ${zoneId},
        jsonb_build_object('cod_enabled', ${rows[0].cod_enabled}, 'is_active', ${rows[0].is_active}, 'fee_kobo', ${rows[0].fee_kobo}))
    `;
    return res.status(200).json({ zone: rows[0] });
  } catch (error) {
    return sendError(res, error);
  }
}