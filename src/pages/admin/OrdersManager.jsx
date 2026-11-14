import { useMemo, useState } from 'react';
import { adminApi } from '../../lib/adminApi';

/**
 * Orders tab (admin console) — replaces the bare Customer/Total/Status/Date
 * table with rich order cards. Each card shows:
 *   - Customer name + tappable phone/email
 *   - Payment method + state (from the payments table, matched on order_id)
 *   - Items with quantities
 *   - Order total and date
 *   - Status select (existing admin mutate path)
 *
 * Read-only data comes from the dashboard hook (orders + payments);
 * the only write is the existing status select.
 */

const money = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : '₦' + Number(v).toLocaleString('en-NG'));
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-NG') : '—');
const clean = (s) => String(s || '').replaceAll('_', ' ');

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

const ORDER_STATUSES = ['awaiting_payment', 'paid', 'processing', 'dispatched', 'delivered', 'cancelled', 'refunded'];

export default function OrdersManager({ orders, payments, refresh }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const paymentByOrder = useMemo(() => {
    const map = new Map();
    (payments || []).forEach((p) => {
      if (!map.has(p.order_id)) map.set(p.order_id, p);
    });
    return map;
  }, [payments]);

  async function saveStatus(id, status) {
    setBusy(id);
    setMsg('');
    try {
      await adminApi.mutate('orders', 'update', { id, values: { status } });
      setMsg('Order updated.');
      refresh();
    } catch (e) {
      setMsg(e.message || 'Could not update the order.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="dash-stack">
      {msg && <div className="dash-alert ok" role="status">{msg}</div>}
      {!orders.length && <p className="muted">No orders yet.</p>}

      {(orders || []).map((o) => {
        const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? safeParse(o.items) : null);
        const payment = paymentByOrder.get(o.id);
        return (
          <article key={o.id} className="dash-panel" style={{ padding: 16 }}>
            <div className="row-top">
              <h3 style={{ fontSize: 16 }}>Order {String(o.id).slice(0, 8)}</h3>
              <span className="chip chip-info">{clean(o.status)}</span>
            </div>

            <ul className="muted small" style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'grid', gap: 4 }}>
              <li><strong>Customer:</strong> {o.customer_name || '—'}</li>
              {o.customer_phone && <li><strong>Phone:</strong> <a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a></li>}
              {o.email && <li><strong>Email:</strong> {o.email}</li>}
              <li><strong>Payment:</strong> {payment ? `${clean(payment.payment_method)} · ${clean(payment.status)}` : 'No payment record'}</li>
              <li><strong>Total:</strong> {money(o.total || o.amount)}</li>
              <li><strong>Date:</strong> {dateTime(o.created_at)}</li>
            </ul>

            {items && items.length > 0 && (
              <ul className="muted small" style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'grid', gap: 4 }}>
                {items.map((it, i) => (
                  <li key={i}>{it.name || it.product_name || it.product_id || 'Item'} × {Number(it.qty || it.quantity) || 1}</li>
                ))}
              </ul>
            )}

            <select
              className="dash-select"
              aria-label={`Status for order ${String(o.id).slice(0, 8)}`}
              value={o.status || 'awaiting_payment'}
              disabled={busy === o.id}
              onChange={(e) => saveStatus(o.id, e.target.value)}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{clean(s)}</option>
              ))}
            </select>
          </article>
        );
      })}
    </div>
  );
}
