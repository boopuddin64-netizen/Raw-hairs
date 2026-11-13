import { useMemo, useState } from 'react';
import { adminApi } from '../../lib/adminApi';

/**
 * Bank-transfer verification queue (admin console).
 *
 * Customers who choose "Bank transfer" at checkout submit their sender name,
 * bank and transfer reference; those receipts land here with status
 * 'awaiting_verification'. Confirming a receipt flips the payment to
 * 'successful' and the order to 'pending_admin_approval' — nothing is ever
 * auto-verified. The server RPC (admin_confirm_bank_transfer) owns all the
 * business rules: stock, reservations and order status change atomically.
 */

const KOBO = (value) => (value == null ? '—' : '₦' + Math.round(Number(value) / 100).toLocaleString('en-NG'));

function safeParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function receiptDetails(payment) {
  const raw = payment.provider_response;
  if (!raw || typeof raw !== 'object') {
    if (typeof raw === 'string' && raw) {
      const obj = safeParse(raw);
      if (obj) return obj;
    }
    return null;
  }
  return raw;
}

export default function PaymentsManager({ payments, refresh }) {
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({});
  const [msg, setMsg] = useState('');

  const queue = useMemo(
    () => (payments || [])
      .filter((p) => p.payment_method === 'bank_transfer' && p.status === 'awaiting_verification')
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    [payments],
  );

  const history = useMemo(
    () => (payments || [])
      .filter((p) => p.payment_method !== 'bank_transfer' || p.status !== 'awaiting_verification')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 25),
    [payments],
  );

  async function decide(paymentId, confirmed) {
    const ownerNote = (note[paymentId] || '').trim();
    if (!confirmed && ownerNote === '') {
      setMsg('Rejections should include a reason for the customer. Type one first.');
      return;
    }
    setBusy(paymentId);
    setMsg('');
    try {
      const result = await adminApi.confirmTransfer(paymentId, confirmed, ownerNote || null);
      setMsg(confirmed
        ? `Payment confirmed — order ${String(result.order_id || '').slice(0, 8)} is now pending admin approval.`
        : `Payment rejected${ownerNote ? ` (${ownerNote})` : ''}.`);
      refresh();
    } catch (e) {
      setMsg(e.message || 'Could not update the payment.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="dash-stack">
      {msg && <div className="dash-alert ok" role="status">{msg}</div>}

      <div className="dash-panel-head">
        <h2>Bank transfers to verify</h2>
        <span className="muted">{queue.length} waiting</span>
      </div>

      {!queue.length && (
        <p className="muted">No bank-transfer receipts are waiting for verification.</p>
      )}

      {(queue || []).map((p) => {
        const d = receiptDetails(p);
        return (
          <article key={p.id} className="dash-panel" style={{ padding: 16 }}>
            <div className="row-top">
              <h3 style={{ fontSize: 16 }}>Order {String(p.order_id || '').slice(0, 8)}</h3>
              <span className="chip chip-info">{KOBO(p.amount_kobo)}</span>
            </div>
            <ul className="muted small" style={{ listStyle: 'none', padding: 0, margin: '10px 0', display: 'grid', gap: 4 }}>
              <li><strong>Sender:</strong> {d?.sender_name || '—'}</li>
              <li><strong>Bank:</strong> {d?.bank || p.provider || '—'}</li>
              <li><strong>Transfer ref:</strong> {d?.transfer_reference || '—'}</li>
              <li><strong>Submitted:</strong> {d?.submitted_at ? new Date(d.submitted_at).toLocaleString('en-NG') : (p.updated_at ? new Date(p.updated_at).toLocaleString('en-NG') : '—')}</li>
              <li><strong>Payment id:</strong> <code>{p.id}</code></li>
            </ul>
            <div className="field">
              <label htmlFor={`note-${p.id}`}>Note (required to reject; stored on the payment)</label>
              <input
                id={`note-${p.id}`}
                value={note[p.id] || ''}
                maxLength={300}
                placeholder="e.g. Amount received does not match the order"
                onChange={(e) => setNote({ ...note, [p.id]: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === p.id}
                onClick={() => decide(p.id, true)}
              >
                {busy === p.id ? 'Working…' : 'Confirm receipt'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy === p.id}
                onClick={() => decide(p.id, false)}
              >
                Reject
              </button>
            </div>
          </article>
        );
      })}

      {history.length > 0 && (
        <>
          <div className="dash-panel-head" style={{ marginTop: 24 }}>
            <h2>Recent payments</h2>
            <span className="muted">last 25</span>
          </div>
          <div className="table-wrap">
            <table className="dash-table">
              <thead><tr><th>Order</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>{String(p.order_id || '').slice(0, 8)}</td>
                    <td>{String(p.payment_method || '').replaceAll('_', ' ')}</td>
                    <td>{KOBO(p.amount_kobo || p.amount)}</td>
                    <td>{String(p.status || '').replaceAll('_', ' ')}</td>
                    <td>{p.created_at ? new Date(p.created_at).toLocaleString('en-NG') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
