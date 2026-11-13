import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chip } from '../components';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { formatKobo } from '../lib/checkout';

/*
 * Customer order tracking — signed-in customers AND guests.
 *
 * Two access paths (WooCommerce / StockX pattern):
 *   1. OWN: the signed-in customer opens /order/<their order id>. RLS makes
 *      the direct query work only for their own orders. Realtime + polling.
 *   2. GUEST: the direct query finds nothing (guest order, or someone else's).
 *      The page asks for the email used at checkout and verifies via the
 *      public_track_order RPC (order id + email must BOTH match — not
 *      enumerable). Guest view updates by 20-second polling.
 */

const TONE = {
  awaiting_payment: 'info',
  paid: 'ok',
  pending_admin_approval: 'warn',
  processing: 'info',
  dispatched: 'warn',
  delivered: 'ok',
  cancelled: 'muted',
  refunded: 'muted',
};

const TRACK_STEPS = ['paid', 'processing', 'dispatched', 'delivered'];
const STEP_LABEL = {
  paid: 'Paid',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

const JOB_LABEL = {
  unassigned: 'Awaiting rider assignment.',
  assigned: 'A rider has been assigned and will collect your order soon.',
  picked_up: 'Your rider has collected your order.',
  in_transit: 'Your order is on its way to you. Keep your 6-digit delivery code ready for the rider.',
  delivered: 'Delivered — confirmed with your delivery code. Thank you!',
  failed: 'The delivery attempt failed. RAW HAIRS will contact you.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Timeline({ status }) {
  const idx = TRACK_STEPS.indexOf(status);
  if (idx === -1) return null;
  return (
    <ol style={{ listStyle: 'none', display: 'flex', gap: 4, padding: 0, margin: '16px 0 8px' }}>
      {TRACK_STEPS.map((s, i) => {
        const done = i <= idx;
        const current = i === idx;
        return (
          <li key={s} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <span aria-hidden="true" style={{ flex: 1, height: 2, background: i <= idx ? 'var(--ok)' : 'var(--border)' }} />
              )}
              <span
                aria-hidden="true"
                style={{
                  width: 14, height: 14, borderRadius: '50%', flex: '0 0 auto',
                  background: done ? 'var(--ok)' : 'var(--border)',
                  outline: current ? '2px solid var(--ok)' : 'none', outlineOffset: 3,
                }}
              />
              {i < TRACK_STEPS.length - 1 && (
                <span aria-hidden="true" style={{ flex: 1, height: 2, background: i < idx ? 'var(--ok)' : 'var(--border)' }} />
              )}
            </div>
            <span className="small" style={{ display: 'block', marginTop: 10, fontWeight: current ? 600 : 400 }}>
              {STEP_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  // mode: loading | own | guest | verify | notfound
  const [mode, setMode] = useState('loading');
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [delivery, setDelivery] = useState(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Path 1: direct query — works only when the signed-in customer owns it (RLS).
  const loadOwn = useCallback(async () => {
    if (!supabase) return false;
    const { data: o, error: oErr } = await supabase
      .from('orders')
      .select('id,status,payment_method,subtotal_kobo,delivery_fee_kobo,total_kobo,customer_name,delivery_address,delivery_city,delivery_state,delivery_instructions,created_at')
      .eq('id', id)
      .maybeSingle();
    if (oErr || !o) return false;
    setOrder(o);
    const [itemsRes, deliveryRes] = await Promise.all([
      supabase.from('order_items').select('product_name,unit_price_kobo,quantity').eq('order_id', id),
      supabase.rpc('customer_order_delivery', { p_order_id: id }).maybeSingle(),
    ]);
    setItems(itemsRes.data || []);
    if (deliveryRes?.data?.ok && deliveryRes.data.job) setDelivery(deliveryRes.data.job);
    setMode('own');
    return true;
  }, [id]);

  // Path 2: guest lookup — order id + checkout email both required.
  const loadGuest = useCallback(async (em) => {
    if (!supabase || !em) return false;
    const { data, error: rpcError } = await supabase.rpc('public_track_order', {
      p_order_id: id,
      p_email: em,
    });
    if (rpcError || !data || data.ok !== true) return false;
    setOrder(data.order);
    setItems(data.items || []);
    setDelivery(data.delivery && data.delivery.status ? data.delivery : null);
    setMode('guest');
    return true;
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!UUID.test(id || '')) { setMode('notfound'); return; }
      if (!supabaseConfigured || !supabase) { setMode('notfound'); return; }
      const ok = await loadOwn();
      if (!ok && alive) setMode('verify');
    })();
    return () => { alive = false; };
  }, [id, loadOwn]);

  // Live updates for the customer's own order (realtime + polling fallback).
  useEffect(() => {
    if (!supabase || mode !== 'own') return undefined;
    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => { loadOwn(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mode, id, loadOwn]);

  // Polling: fallback for 'own' and the only live path for guests.
  useEffect(() => {
    if (mode !== 'own' && mode !== 'guest') return undefined;
    const timer = setInterval(() => {
      if (mode === 'own') loadOwn();
      else if (email) loadGuest(email);
    }, 20000);
    return () => clearInterval(timer);
  }, [mode, email, loadOwn, loadGuest]);

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await loadGuest(email.trim());
    if (!ok) setError('We could not match that order id and email. Please check both and try again.');
    setBusy(false);
  };

  if (!supabaseConfigured) {
    return <div className="wrap page"><h1>Order</h1><div className="notice auth-error">Orders are not connected in this deployment.</div></div>;
  }

  if (mode === 'loading') {
    return <div className="wrap page"><h1>Order</h1><p className="muted">Loading order…</p></div>;
  }

  if (mode === 'notfound') {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <p className="eyebrow">ORDER</p>
        <h1>Order not found</h1>
        <div className="notice" role="status">
          <p>That order link is not valid. Use the order id from your payment confirmation.</p>
          <Link to="/account" className="btn btn-primary">Go to my account</Link>
        </div>
      </div>
    );
  }

  // Guest verification screen: order not visible to this visitor directly.
  if (mode === 'verify') {
    return (
      <div className="wrap page" style={{ maxWidth: 560 }}>
        <p className="eyebrow">ORDER</p>
        <h1>Track your order</h1>
        <p className="muted small" style={{ margin: '6px 0 16px' }}>
          This order was placed without the account you are using now, or as a guest.
          Enter the email address you used at checkout to view its status.
        </p>
        <form onSubmit={submitEmail} className="stack" style={{ gap: 10 }}>
          <div className="field">
            <label htmlFor="o-e">Email used at checkout</label>
            <input id="o-e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="notice auth-error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'View order'}
          </button>
          <p className="muted small">
            Signed in with the account you ordered with? <Link to="/account">Go to my account</Link> — orders placed
            with the same email are linked there automatically.
          </p>
        </form>
      </div>
    );
  }

  const status = order.status;
  const address = [order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join(', ');

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <p className="eyebrow">ORDER</p>
      <div className="row-top">
        <h1>Order {order.id.slice(0, 8)}</h1>
        <Chip tone={TONE[status] || 'muted'}>{String(status).replaceAll('_', ' ')}</Chip>
      </div>
      <p className="muted small" style={{ margin: '4px 0 8px' }}>
        {order.created_at ? new Date(order.created_at).toLocaleString('en-NG') : ''}
        {order.payment_method ? ` · Paid by ${order.payment_method.replaceAll('_', ' ')}` : ''}
        {mode === 'guest' ? ' · Guest order' : ''}
      </p>

      {status === 'awaiting_payment' && (
        <div className="notice" role="status">
          <p><strong>Payment pending.</strong> If you just paid, this updates automatically within seconds — no need to refresh.</p>
        </div>
      )}
      {status === 'cancelled' && (
        <div className="notice" role="status"><p><strong>This order was cancelled.</strong> If you were charged, contact RAW HAIRS on Instagram @raw.hairs.</p></div>
      )}
      {status === 'refunded' && (
        <div className="notice" role="status"><p><strong>This order was refunded.</strong> The money is on its way back to your payment method.</p></div>
      )}

      <Timeline status={status} />

      {delivery && delivery.status && JOB_LABEL[delivery.status] && (
        <div className="notice" role="status" style={{ marginTop: 12 }}>
          <p><strong>Delivery:</strong> {JOB_LABEL[delivery.status]}</p>
        </div>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 500, margin: '24px 0 10px' }}>Your items</h2>
      <div className="stack">
        {items.map((it, i) => (
          <article key={`${it.product_name}-${i}`} className="row-card" style={{ flexDirection: 'column', gap: 4 }}>
            <div className="row-top">
              <h3 style={{ fontSize: 15 }}>{it.product_name}</h3>
              <span className="muted small">× {it.quantity}</span>
            </div>
            {it.unit_price_kobo != null && <span className="muted small">{formatKobo(it.unit_price_kobo)} each</span>}
          </article>
        ))}
        {items.length === 0 && <p className="muted small">Item details are not available for this order.</p>}
      </div>

      <div className="summary" style={{ marginTop: 16 }}>
        <div className="line"><span className="muted">Subtotal</span><span>{formatKobo(order.subtotal_kobo)}</span></div>
        <div className="line"><span className="muted">Delivery</span><span>{formatKobo(order.delivery_fee_kobo)}</span></div>
        <div className="line total"><span>Total</span><span className="price">{formatKobo(order.total_kobo)}</span></div>
      </div>

      {address && (
        <>
          <h2 style={{ fontSize: 20, fontWeight: 500, margin: '24px 0 10px' }}>Delivery address</h2>
          <div className="row-card" style={{ flexDirection: 'column', gap: 4 }}>
            <strong style={{ fontSize: 14 }}>{order.customer_name}</strong>
            <span className="muted small">{address}</span>
            {order.delivery_instructions && <span className="muted small">Notes: {order.delivery_instructions}</span>}
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 20 }}>
        {mode === 'guest' && <Link className="btn btn-ghost" to="/account">Create an account to keep your orders</Link>}
        {mode === 'own' && <Link className="btn btn-ghost" to="/account">Back to my account</Link>}
        <Link className="btn btn-primary" to="/shop">Continue shopping</Link>
      </div>
    </div>
  );
}
