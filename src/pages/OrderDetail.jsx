import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Chip } from '../components';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { formatKobo } from '../lib/checkout';

/*
 * Customer order tracking. Read-only: RLS already limits every query to the
 * signed-in customer's own orders, so this page is safe by default.
 *
 * Live updates use two independent paths:
 *   1. Supabase realtime on the orders row (when the publication is enabled)
 *   2. A 20-second polling fallback that always works
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

// The forward path a healthy order follows.
const TRACK_STEPS = ['paid', 'processing', 'dispatched', 'delivered'];
const STEP_LABEL = {
  paid: 'Paid',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

// Delivery context from rider_jobs (fetched through customer_order_delivery RPC).
const JOB_LABEL = {
  unassigned: 'Awaiting rider assignment.',
  assigned: 'A rider has been assigned and will collect your order soon.',
  picked_up: 'Your rider has collected your order.',
  in_transit: 'Your order is on its way to you. Keep your 6-digit delivery code ready for the rider.',
  delivered: 'Delivered — confirmed with your delivery code. Thank you!',
  failed: 'The delivery attempt failed. RAW HAIRS will contact you.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lineKobo(row) {
  // order_items stores unit_price_kobo (older rows may have naira unit_price).
  if (row.unit_price_kobo != null) return Number(row.unit_price_kobo);
  if (row.unit_price != null) return Math.round(Number(row.unit_price) * 100);
  return null;
}

function Timeline({ status }) {
  const idx = TRACK_STEPS.indexOf(status);
  if (idx === -1) return null; // awaiting_payment / cancelled / refunded show notices instead
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
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) return;
    if (!UUID.test(id || '')) { setError('That order link is not valid.'); return; }
    const { data: o, error: oErr } = await supabase
      .from('orders')
      .select('id,status,payment_method,subtotal_kobo,delivery_fee_kobo,total_kobo,subtotal,delivery_fee,total,customer_name,delivery_address,delivery_state,delivery_city,delivery_instructions,created_at')
      .eq('id', id)
      .maybeSingle();
    if (oErr) { setError(oErr.message); return; }
    setOrder(o);
    if (!o) return;

    const [itemsRes, deliveryRes] = await Promise.all([
      supabase.from('order_items').select('product_name,unit_price_kobo,unit_price,quantity').eq('order_id', id),
      // Best effort: the RPC ships with this feature's migration; ignore errors.
      supabase.rpc('customer_order_delivery', { p_order_id: id }),
    ]);
    if (itemsRes.data) setItems(itemsRes.data);
    if (deliveryRes?.data?.ok && deliveryRes.data.job) setJob(deliveryRes.data.job);
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  // Live updates: realtime when the orders row changes + polling fallback.
  useEffect(() => {
    if (!supabase || !order) return undefined;
    const channel = supabase
      .channel(`order-tracking-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => { load(); })
      .subscribe();
    const timer = setInterval(load, 20000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id, Boolean(order), load]);

  if (!supabaseConfigured) {
    return <div className="wrap page"><h1>Order</h1><div className="notice auth-error">Orders are not connected in this deployment.</div></div>;
  }

  if (loading) {
    return <div className="wrap page"><h1>Order</h1><p className="muted">Loading order…</p></div>;
  }

  if (!order) {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <p className="eyebrow">ORDER</p>
        <h1>Order not found</h1>
        <div className="notice" role="status">
          <p>We could not find that order for this account. Make sure you are signed in with the account you ordered with.</p>
          <Link to="/account" className="btn btn-primary">Go to my account</Link>
        </div>
      </div>
    );
  }

  const status = order.status;
  const totalDisplay = order.total_kobo != null
    ? formatKobo(order.total_kobo)
    : (order.total != null ? `₦${Number(order.total).toLocaleString('en-NG')}` : '');
  const subtotalDisplay = order.subtotal_kobo != null
    ? formatKobo(order.subtotal_kobo)
    : (order.subtotal != null ? `₦${Number(order.subtotal).toLocaleString('en-NG')}` : '');
  const feeDisplay = order.delivery_fee_kobo != null
    ? formatKobo(order.delivery_fee_kobo)
    : (order.delivery_fee != null ? `₦${Number(order.delivery_fee).toLocaleString('en-NG')}` : '');
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
      </p>
      {error && <div className="notice auth-error" role="alert">{error}</div>}

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

      {/* Delivery context once a rider job exists for this order */}
      {job && job.status && JOB_LABEL[job.status] && status !== 'delivered' && (
        <div className="notice" role="status" style={{ marginTop: 12 }}>
          <p><strong>Delivery:</strong> {JOB_LABEL[job.status]}</p>
        </div>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 500, margin: '24px 0 10px' }}>Your items</h2>
      <div className="stack">
        {items.map((it, i) => {
          const unit = lineKobo(it);
          return (
            <article key={`${it.product_name}-${i}`} className="row-card" style={{ flexDirection: 'column', gap: 4 }}>
              <div className="row-top">
                <h3 style={{ fontSize: 15 }}>{it.product_name}</h3>
                <span className="muted small">× {it.quantity}</span>
              </div>
              {unit != null && <span className="muted small">{formatKobo(unit)} each</span>}
            </article>
          );
        })}
        {items.length === 0 && <p className="muted small">Item details are not available for this order.</p>}
      </div>

      <div className="summary" style={{ marginTop: 16 }}>
        <div className="line"><span className="muted">Subtotal</span><span>{subtotalDisplay}</span></div>
        <div className="line"><span className="muted">Delivery</span><span>{feeDisplay}</span></div>
        <div className="line total"><span>Total</span><span className="price">{totalDisplay}</span></div>
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
        <Link className="btn btn-ghost" to="/account">Back to my account</Link>
        <Link className="btn btn-primary" to="/shop">Continue shopping</Link>
      </div>
    </div>
  );
}
