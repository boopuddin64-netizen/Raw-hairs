import crypto from 'node:crypto';
import { getDb } from '../_lib/db.js';
import { verifyPaystackSignature } from '../_lib/paystackSignature.js';
import { readLimitedRequestBody } from '../_lib/request.js';

const PAY_REF = /^[A-Za-z0-9._-]{6,100}$/;
const MAX_WEBHOOK_BYTES = 1024 * 1024;

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  let rawBody;
  try { rawBody = await readLimitedRequestBody(request, MAX_WEBHOOK_BYTES); }
  catch (err) { return response({ error: err.message || 'Invalid request body.' }, err.status || 400); }

  const secrets = [process.env.PAYSTACK_WEBHOOK_SECRET, process.env.PAYSTACK_SECRET_KEY];
  const signature = request.headers.get('x-paystack-signature') || request.headers.get('paystack-signature') || '';
  if (!verifyPaystackSignature(rawBody, signature, secrets)) return response({ error: 'Invalid signature.' }, 401);

  let event;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { return response({ ok: true, ignored: true }); }

  const reference = typeof event?.data?.reference === 'string' ? event.data.reference : '';
  if (event?.event !== 'charge.success' || !PAY_REF.test(reference)) return response({ ok: true, ignored: true });

  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) return response({ error: 'Payment is not configured yet.' }, 503);
  let out;
  try {
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    out = await verifyResponse.json().catch(() => null);
  } catch {
    return response({ error: 'Could not reach Paystack for verification.' }, 502);
  }
  if (!out || !out.status || out.data?.status !== 'success') return response({ ok: true, ignored: true });

  const transactionId = Number(out.data?.id);
  const amount = Number(out.data?.amount);
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0
      || !Number.isSafeInteger(amount) || amount < 0
      || out.data?.reference !== reference || out.data?.currency !== 'NGN') {
    return response({ ok: true, ignored: true });
  }

  const db = getDb();
  if (!db) return response({ error: 'The server is missing its Supabase configuration.' }, 503);
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const { data, error } = await db.rpc('mark_payment_successful_from_webhook', {
    p_reference: reference,
    p_amount_kobo: amount,
    p_provider_response: {
      channel: out.data.channel,
      paid_at: out.data.paid_at,
      gateway_response: out.data.gateway_response,
    },
    p_transaction_id: transactionId,
    p_payload_sha256: payloadHash,
  });
  if (error || !data?.ok) {
    console.error('[pay-webhook] payment record rejected', error?.message || data?.error || 'unknown error');
    return response({ error: 'Could not record the payment.' }, 500);
  }
  return response({ ok: true, status: data.status || 'successful' });
}
