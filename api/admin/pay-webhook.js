import { getDb } from '../_lib/db.js';
import { verifyPaystackSignature } from '../_lib/paystackSignature.js';

/**
 * Paystack webhook (Phase 3 → hardened). This static endpoint shadows the
 * [action].js catch-all for /api/admin/pay-webhook — the registered webhook
 * URL is unchanged — but uses the web-standard Request so the RAW body is
 * available for signature verification (the legacy req/res handler has the
 * body parsed before it runs, which breaks HMAC checks).
 *
 * Security: every event is signature-verified against the signing secret(s)
 * before anything else happens. Unsigned / wrongly-signed requests get 401
 * and never touch the database.
 */

const PAY_REF = /^[A-Za-z0-9._-]{6,100}$/;

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'content-type': 'application/json', Allow: 'POST' },
    });
  }

  // Candidate secrets: prefer the dedicated webhook signing secret if set,
  // fall back to the Paystack secret key (legacy scheme signs with it).
  const secrets = [
    process.env.PAYSTACK_WEBHOOK_SECRET,
    process.env.PAYSTACK_SECRET_KEY,
  ];

  const rawBody = Buffer.from(await request.arrayBuffer());
  const header = request.headers.get('x-paystack-signature') || request.headers.get('paystack-signature') || '';

  if (!verifyPaystackSignature(rawBody, header, secrets)) {
    return new Response(JSON.stringify({ error: 'Invalid signature.' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    // Signed but unparseable — acknowledge so Paystack stops retrying.
    return Response.json({ ok: true, ignored: true });
  }

  // Only charge.success matters; acknowledge-and-ignore everything else.
  const reference = event?.data?.reference || '';
  if (event?.event !== 'charge.success' || !PAY_REF.test(reference)) {
    return Response.json({ ok: true, ignored: true });
  }

  // Re-verify with Paystack — the signature only proves origin, not truth.
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: 'Payment is not configured yet.' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const out = await r.json().catch(() => null);
  if (!out || !out.status || out.data?.status !== 'success') {
    // Don't 500 on a genuinely "pending"/"failed" transaction: acknowledge.
    return Response.json({ ok: true, ignored: true });
  }

  const db = getDb();
  if (!db) {
    // 500 so Paystack retries when the server is misconfigured.
    return new Response(JSON.stringify({ error: 'The server is missing its Supabase configuration.' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { error: rpcError } = await db.rpc('mark_payment_successful', {
    p_reference: reference,
    p_amount_kobo: out.data.amount,
    p_provider_response: {
      channel: out.data.channel,
      paid_at: out.data.paid_at,
      gateway_response: out.data.gateway_response,
    },
  });
  if (rpcError) {
    console.error('[pay-webhook] rpc error', rpcError.message);
    return new Response(JSON.stringify({ error: 'Could not record the payment.' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return Response.json({ ok: true });
}
