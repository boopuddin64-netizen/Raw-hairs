import { supabase, supabaseConfigured } from './supabase';

/**
 * RAW HAIRS checkout client.
 *
 * Flow (all money is computed server-side; the client never sends amounts):
 *   1. reserveCartItems(cart)       -> 15-min reservation (session_token)
 *   2. createOrder(session, form)   -> order in 'awaiting_payment'
 *   3. registerPaymentIntent(order) -> payment reference
 *   4. Paystack hosted checkout or bank-transfer receipt submission
 *
 * The reservation countdown is authoritative on the server
 * (inventory_reservations.expires_at); the UI timer is cosmetic only.
 */

export const RESERVATION_MINUTES = 15;

/** Human error messages for the RPC error codes. */
export function checkoutErrorMessage(error) {
  const map = {
    product_unavailable: 'An item in your bag is no longer available. Please refresh and try again.',
    insufficient_stock: 'Not enough stock for an item in your bag. Please reduce the quantity.',
    reservation_expired: 'Your reservation window has passed. Please start checkout again.',
    reservation_not_found: 'Your reservation could not be found. Please start checkout again.',
    invalid_items: 'Your bag could not be read. Please refresh the page.',
    duplicate_product: 'Please combine duplicate items into one line before checking out.',
    pricing_failed: 'Prices are being updated right now. Please try again in a moment.',
    order_not_payable: 'This order can no longer be paid.',
    order_not_paystack: 'This order is not a Paystack order.',
    order_not_bank_transfer: 'This order is not a bank-transfer order.',
    not_your_order: 'This order does not belong to you.',
    email_required_for_paystack: 'Please provide your email for the payment receipt.',
    missing_checkout_details: 'Please fill in your name, phone number, and delivery address.',
    invalid_payment_method: 'Please choose a payment method.',
    payment_not_found: 'Payment reference not found. Please contact support.',
    payment_previously_failed: 'This payment was declined. Please start a new payment.',
  };
  return map[error] || 'Something went wrong. Please try again.';
}

function requireSupabase() {
  if (!supabaseConfigured || !supabase) {
    throw new Error('Online checkout is not connected yet. Please contact RAW HAIRS on WhatsApp.');
  }
}

/** Step 1: atomically reserve all cart lines for 15 minutes. */
export async function reserveCartItems(cart, minutes = RESERVATION_MINUTES) {
  requireSupabase();
  const items = cart
    .filter((l) => l.id && l.qty > 0)
    .map((l) => ({ product_id: l.id, quantity: l.qty }));
  if (items.length === 0) throw new Error('Your bag is empty.');

  const { data, error } = await supabase.rpc('reserve_cart_items', {
    p_items: items,
    p_minutes: minutes,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const e = new Error(checkoutErrorMessage(data && data.error));
    if (data) { e.code = data.error; if (data.available != null) e.available = data.available; }
    throw e;
  }
  return data; // { ok, session_token, expires_at }
}

/** Step 2: create the order (server-priced) from the reservation. */
export async function createOrder(sessionToken, form) {
  requireSupabase();
  const { data, error } = await supabase.rpc('create_order_from_reservation', {
    p_session_token: sessionToken,
    p_customer_name: form.name,
    p_customer_phone: form.phone,
    p_customer_email: form.email,
    p_delivery_address: form.address,
    p_delivery_state: form.state,
    p_delivery_city: form.city,
    p_delivery_instructions: form.instructions,
    p_payment_method: form.paymentMethod,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const e = new Error(checkoutErrorMessage(data && data.error));
    if (data) e.code = data.error;
    throw e;
  }
  return data; // { ok, order_id, total_kobo, subtotal_kobo, delivery_fee_kobo }
}

/** Step 3: get (or create) the Paystack payment reference for an order. */
export async function registerPaymentIntent(orderId) {
  requireSupabase();
  const { data, error } = await supabase.rpc('register_payment_intent', {
    p_order_id: orderId,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const e = new Error(checkoutErrorMessage(data && data.error));
    if (data) e.code = data.error;
    throw e;
  }
  return data; // { ok, payment_id, reference, amount_kobo }
}

/** Bank-transfer receipt submission (owner verifies manually; never auto-paid). */
export async function submitBankTransferReceipt(orderId, form) {
  requireSupabase();
  const { data, error } = await supabase.rpc('submit_bank_transfer_receipt', {
    p_order_id: orderId,
    p_sender_name: form.senderName,
    p_bank: form.bank,
    p_transfer_reference: form.transferReference,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const e = new Error(checkoutErrorMessage(data && data.error));
    if (data) e.code = data.error;
    throw e;
  }
  return data; // { ok, payment_id, status }
}

/** Guest receipt lookup: order id + email (non-enumerable, no login). */
export async function guestOrderReceipt(orderId, email) {
  requireSupabase();
  const { data, error } = await supabase.rpc('guest_order_receipt', {
    p_order_id: orderId,
    p_email: email,
  });
  if (error) throw error;
  if (!data || data.ok !== true) {
    const e = new Error('Order not found. Please check the order id and email address.');
    if (data) e.code = data.error;
    throw e;
  }
  return data;
}

/** Ask the server to initialize a Paystack transaction (server-side key only). */
export async function initializePaystackTransaction({ orderId, reference, email }) {
  const res = await fetch('/api/admin/pay-init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, email }),
  });
  const json = await res.json();
  if (!res.ok || json.ok !== true) {
    throw new Error((json && json.error) || 'Could not start the payment. Please try again.');
  }
  return json; // { ok, authorization_url, reference, amount_kobo }
}

/** Ask the server to verify a Paystack transaction (server re-verifies with Paystack). */
export async function verifyPaystackTransaction(reference) {
  const res = await fetch('/api/admin/pay-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference }),
  });
  const json = await res.json();
  if (!res.ok || json.ok !== true) {
    throw new Error((json && json.error) || 'Payment is not confirmed yet.');
  }
  return json; // { ok, status }
}

/** Countdown helper: seconds remaining until the reservation expiry. */
export function secondsRemaining(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

/** Format kobo amounts as naira for display. */
export function formatKobo(kobo) {
  const n = (Number(kobo) || 0) / 100;
  return '\u20a6' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export { supabase };
