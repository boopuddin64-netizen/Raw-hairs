import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '../components';
import { useStaffAuth } from '../auth/StaffAuth';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useRealtimeDashboard, buildAnalytics } from '../hooks/useRealtimeDashboard';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { useTheme } from '../theme/ThemeContext';

const NAV = [
  { id: 'Overview', label: 'Overview' },
  { id: 'Products', label: 'Products' },
  { id: 'Services', label: 'Services' },
  { id: 'Orders', label: 'Orders' },
  { id: 'Bookings', label: 'Bookings' },
  { id: 'International', label: 'International' },
  { id: 'Rider jobs', label: 'Drivers' },
  { id: 'Ratings', label: 'Ratings' },
  { id: 'Rules', label: 'Rules' },
  { id: 'Settings', label: 'Settings' },
];

const ORDER_STATUSES = ['awaiting_payment', 'paid', 'processing', 'dispatched', 'delivered', 'cancelled', 'refunded'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const REQUEST_STATUSES = ['pending', 'quoted', 'approved', 'declined', 'converted'];
const JOB_STATUSES = ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];

const money = (value) => (value == null || Number.isNaN(Number(value)) ? '—' : '₦' + Number(value).toLocaleString('en-NG'));
const dateTime = (value) => (value ? new Date(value).toLocaleString('en-NG') : '—');
const dateShort = (value) => (value ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—');
const errorText = (error) => error?.message || 'Something went wrong. Please try again.';
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function StatusSelect({ value, options, onSave, label }) {
  return (
    <select className="dash-select" aria-label={label} value={value} onChange={(e) => onSave(e.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>
      ))}
    </select>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <div className={`dash-kpi${tone ? ` dash-kpi-${tone}` : ''}`}>
      <span className="dash-kpi-label">{label}</span>
      <strong className="dash-kpi-value">{value}</strong>
      {hint && <span className="dash-kpi-hint">{hint}</span>}
    </div>
  );
}

export default function Admin() {
  const { staff, signOut } = useStaffAuth();
  const { theme, toggleTheme } = useTheme();
  const { config, setConfig, save, saving, message } = useStoreConfig();
  const { orders, bookings, products, services, international, riderJobs, loading, error, refresh } = useRealtimeDashboard();
  const [tab, setTab] = useState('Overview');
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState({ customer_name: '', rating: 5, comment: '', product_id: '' });
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const analytics = useMemo(() => buildAnalytics({ orders, bookings, products, services, international, riderJobs }), [orders, bookings, products, services, international, riderJobs]);

  const goalProgress = useMemo(() => {
    const g = config.goals;
    return {
      daily: g.daily_revenue ? Math.min(100, Math.round((analytics.revenueToday / g.daily_revenue) * 100)) : 0,
      weekly: g.weekly_revenue ? Math.min(100, Math.round((analytics.revenueWeek / g.weekly_revenue) * 100)) : 0,
      orders: g.monthly_orders ? Math.min(100, Math.round((analytics.ordersAll / g.monthly_orders) * 100)) : 0,
    };
  }, [analytics, config.goals]);

  async function loadReviews() {
    if (!supabaseConfigured) return;
    const { data } = await supabase.from('reviews').select('*').order('created_at', { ascending: false }).limit(50);
    setReviews(data || []);
  }

  async function saveStatus(table, id, status) {
    setBusy(true);
    setStatusMsg('');
    try {
      const { error: err } = await supabase.from(table).update({ status }).eq('id', id);
      if (err) throw err;
      setStatusMsg('Updated');
      refresh();
    } catch (e) {
      setStatusMsg(errorText(e));
    } finally {
      setBusy(false);
      setTimeout(() => setStatusMsg(''), 2000);
    }
  }

  async function addReview(e) {
    e.preventDefault();
    if (!supabaseConfigured) return;
    setBusy(true);
    try {
      const { error: err } = await supabase.from('reviews').insert({
        customer_name: reviewForm.customer_name || 'Anonymous',
        rating: Number(reviewForm.rating) || 5,
        comment: reviewForm.comment || null,
        product_id: reviewForm.product_id || null,
      });
      if (err) throw err;
      setReviewForm({ customer_name: '', rating: 5, comment: '', product_id: '' });
      loadReviews();
    } catch (e) {
      setStatusMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const rows = [['Type', 'ID', 'Customer', 'Amount', 'Status', 'Date']];
    orders.forEach((o) => rows.push(['order', o.id, o.customer_name || o.email || '', o.total || o.amount || 0, o.status, o.created_at]));
    bookings.forEach((b) => rows.push(['booking', b.id, b.customer_name || b.email || '', b.price || b.amount || 0, b.status, b.created_at]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raw-hairs-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxBar = Math.max(1, ...(analytics.revenueSeries || []).map((d) => d.value));
  const maxFunnel = Math.max(1, ...(Object.values(analytics.funnel || {})));
  const maxCat = Math.max(1, ...(Object.values(analytics.byCategory || {})));

  return (
    <div className="dash">
      <header className="dash-top">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1>RAW HAIRS</h1>
          <p className="muted">{staff?.email || 'Signed in'}</p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-ghost" type="button" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={refresh} disabled={loading}>Refresh</button>
          <button className="btn btn-ghost" type="button" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-ghost" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {error && <div className="dash-alert">{error}</div>}
      {statusMsg && <div className="dash-alert ok">{statusMsg}</div>}

      <nav className="dash-nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            onClick={() => {
              setTab(item.id);
              if (item.id === 'Ratings') loadReviews();
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'Overview' && (
        <>
          <div className="dash-kpis">
            <Kpi label="Revenue today" value={money(analytics.revenueToday)} tone="accent" />
            <Kpi label="Revenue (7d)" value={money(analytics.revenueWeek)} />
            <Kpi label="Orders" value={analytics.ordersAll} hint={`${analytics.ordersPaid} paid`} />
            <Kpi label="Bookings" value={analytics.bookingsAll} hint={`${analytics.bookingsConfirmed} confirmed`} />
            <Kpi label="Active products" value={analytics.productsActive} />
            <Kpi label="Open jobs" value={analytics.openJobs} />
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Sales goals</h2></div>
              <div className="goal-list">
                {[
                  ['Daily revenue', analytics.revenueToday, config.goals.daily_revenue, goalProgress.daily],
                  ['Weekly revenue', analytics.revenueWeek, config.goals.weekly_revenue, goalProgress.weekly],
                  ['Orders (all listed)', analytics.ordersAll, config.goals.monthly_orders, goalProgress.orders],
                ].map(([label, current, target, pct]) => (
                  <div key={label} className="goal-row">
                    <div className="goal-meta">
                      <span>{label}</span>
                      <strong>{money(current)} / {money(target)}</strong>
                    </div>
                    <div className="goal-bar"><i style={{ width: `${pct}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Last 7 days revenue</h2></div>
              <div className="analytics-bars">
                {(analytics.revenueSeries || []).map((d) => (
                  <div key={d.label} className="bar-col">
                    <div className="bar-track"><i style={{ height: `${Math.round((d.value / maxBar) * 100)}%` }} /></div>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Conversion funnel</h2></div>
              <div className="funnel">
                {[
                  ['Active catalogue', analytics.funnel?.catalogue || 0],
                  ['Orders placed', analytics.funnel?.orders || 0],
                  ['Paid', analytics.funnel?.paid || 0],
                  ['Delivered', analytics.funnel?.delivered || 0],
                  ['Bookings', analytics.funnel?.bookings || 0],
                  ['Confirmed bookings', analytics.funnel?.confirmedBookings || 0],
                ].map(([label, value]) => {
                  const max = maxFunnel;
                  return (
                    <div key={label} className="funnel-row">
                      <span>{label}</span>
                      <div className="funnel-track"><i style={{ width: `${Math.round((value / max) * 100)}%` }} /></div>
                      <strong>{value}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Top products</h2></div>
              <ul className="top-list">
                {(analytics.topProducts || []).slice(0, 8).map((p) => (
                  <li key={p.id || p.name}>
                    <span>{p.name}</span>
                    <strong>{p.count} · {money(p.revenue)}</strong>
                  </li>
                ))}
                {!(analytics.topProducts || []).length && <li className="muted">No sales data yet</li>}
              </ul>
            </div>
          </div>

          <div className="dash-grid-2">
            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Revenue by category</h2></div>
              <div className="funnel">
                {Object.entries(analytics.byCategory || {}).map(([cat, val]) => (
                  <div key={cat} className="funnel-row">
                    <span>{cat}</span>
                    <div className="funnel-track"><i style={{ width: `${Math.round((val / maxCat) * 100)}%` }} /></div>
                    <strong>{money(val)}</strong>
                  </div>
                ))}
                {!Object.keys(analytics.byCategory || {}).length && <p className="muted">No category data</p>}
              </div>
            </div>
            <div className="dash-panel">
              <div className="dash-panel-head"><h2>Quick links</h2></div>
              <div className="dash-quick">
                <button type="button" className="dash-quick-btn" onClick={() => setTab('Orders')}>Manage orders</button>
                <button type="button" className="dash-quick-btn" onClick={() => setTab('Bookings')}>Manage bookings</button>
                <button type="button" className="dash-quick-btn" onClick={() => setTab('Settings')}>Store settings</button>
                <button type="button" className="dash-quick-btn" onClick={() => setTab('Rules')}>Business rules</button>
              </div>
            </div>
          </div>
        </>
      )}

      {tab !== 'Overview' && tab !== 'Rules' && tab !== 'Settings' && tab !== 'Ratings' && (
        <div className="dash-panel">
          <div className="dash-panel-head">
            <h2>{tab}</h2>
            <span className="muted">{loading ? 'Loading…' : ''}</span>
          </div>
          {/* list views for Products, Services, Orders, Bookings, International, Rider jobs */}
          {tab === 'Orders' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.customer_name || o.email || o.customer_id || o.id}</td>
                      <td>{money(o.total || o.amount)}</td>
                      <td>
                        <StatusSelect value={o.status || 'processing'} options={ORDER_STATUSES} label="Order status" onSave={(v) => saveStatus('orders', o.id, v)} />
                      </td>
                      <td>{dateTime(o.created_at)}</td>
                    </tr>
                  ))}
                  {!orders.length && <tr><td colSpan={4} className="muted">No orders</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Bookings' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Customer</th><th>Service</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.customer_name || b.customer_phone || b.customer_id || b.id}</td>
                      <td>{b.service_name || b.service_id || '—'}</td>
                      <td>
                        <StatusSelect value={b.status || 'pending'} options={BOOKING_STATUSES} label="Booking status" onSave={(v) => saveStatus('bookings', b.id, v)} />
                      </td>
                      <td>{dateTime(b.scheduled_at || b.created_at)}</td>
                    </tr>
                  ))}
                  {!bookings.length && <tr><td colSpan={4} className="muted">No bookings</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Products' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Active</th></tr></thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{money(p.price)}</td>
                      <td>{p.stock ?? '—'}</td>
                      <td>{p.is_active ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                  {!products.length && <tr><td colSpan={4} className="muted">No products</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Services' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Name</th><th>Price</th><th>Active</th></tr></thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{money(s.price)}</td>
                      <td>{s.active === false ? 'No' : 'Yes'}</td>
                    </tr>
                  ))}
                  {!services.length && <tr><td colSpan={3} className="muted">No services</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'International' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Customer</th><th>Details</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {international.map((r) => (
                    <tr key={r.id}>
                      <td>{r.customer_name || r.customer_email || r.customer_id || r.id}</td>
                      <td>{r.request_details || '—'}</td>
                      <td>
                        <StatusSelect value={r.status || 'pending'} options={REQUEST_STATUSES} label="Request status" onSave={(v) => saveStatus('international_requests', r.id, v)} />
                      </td>
                      <td>{dateTime(r.created_at)}</td>
                    </tr>
                  ))}
                  {!international.length && <tr><td colSpan={4} className="muted">No international requests</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Rider jobs' && (
            <div className="table-wrap">
              <table className="dash-table">
                <thead><tr><th>Job</th><th>Rider</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {riderJobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.order_id || j.id}</td>
                      <td>{j.rider_name || j.rider_id || '—'}</td>
                      <td>
                        <StatusSelect value={j.status || 'unassigned'} options={JOB_STATUSES} label="Job status" onSave={(v) => saveStatus('rider_jobs', j.id, v)} />
                      </td>
                      <td>{dateTime(j.created_at)}</td>
                    </tr>
                  ))}
                  {!riderJobs.length && <tr><td colSpan={4} className="muted">No rider jobs</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Ratings' && (
        <div className="dash-panel">
          <div className="dash-panel-head"><h2>Ratings & reviews</h2></div>
          <form className="dash-form" onSubmit={addReview}>
            <label>Customer name<input value={reviewForm.customer_name} onChange={(e) => setReviewForm({ ...reviewForm, customer_name: e.target.value })} /></label>
            <label>Rating
              <select value={reviewForm.rating} onChange={(e) => setReviewForm({ ...reviewForm, rating: e.target.value })}>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>Comment<textarea value={reviewForm.comment} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} rows={3} /></label>
            <button className="btn" type="submit" disabled={busy}>Add review</button>
          </form>
          <ul className="top-list" style={{ marginTop: 16 }}>
            {reviews.map((r) => (
              <li key={r.id}>
                <span>{r.customer_name || 'Anonymous'} · {'★'.repeat(r.rating || 0)}</span>
                <strong>{dateShort(r.created_at)}</strong>
                {r.comment && <p className="muted" style={{ width: '100%' }}>{r.comment}</p>}
              </li>
            ))}
            {!reviews.length && <li className="muted">No reviews yet</li>}
          </ul>
        </div>
      )}

      {tab === 'Rules' && (
        <div className="dash-panel">
          <div className="dash-panel-head"><h2>Business rules</h2></div>
          <div className="rule-list">
            {[
              ['auto_confirm_bookings', 'Auto-confirm new bookings'],
              ['require_payment_before_dispatch', 'Require payment before dispatch'],
              ['allow_guest_checkout', 'Allow guest checkout'],
            ].map(([key, label]) => (
              <label key={key} className="rule-row">
                <input
                  type="checkbox"
                  checked={!!config.rules[key]}
                  onChange={(e) => setConfig({ ...config, rules: { ...config.rules, [key]: e.target.checked } })}
                />
                <span>{label}</span>
              </label>
            ))}
            <label className="rule-row">
              <span>Max items per order</span>
              <input
                type="number"
                min={1}
                value={config.rules.max_items_per_order ?? 20}
                onChange={(e) => setConfig({ ...config, rules: { ...config.rules, max_items_per_order: Number(e.target.value) || 20 } })}
              />
            </label>
            <label className="rule-row">
              <span>Rider assignment</span>
              <select
                value={config.rules.rider_assignment_mode || 'manual'}
                onChange={(e) => setConfig({ ...config, rules: { ...config.rules, rider_assignment_mode: e.target.value } })}
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </select>
            </label>
          </div>
          <button className="btn" type="button" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save rules'}</button>
          {message && <p className="muted">{message}</p>}
        </div>
      )}

      {tab === 'Settings' && (
        <div className="dash-panel">
          <div className="dash-panel-head"><h2>Store settings & goals</h2></div>
          <div className="dash-form">
            <label>Store name<input value={config.settings.store_name || ''} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, store_name: e.target.value } })} /></label>
            <label>Default delivery fee (₦)<input type="number" value={config.settings.delivery_fee_default ?? 2500} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, delivery_fee_default: Number(e.target.value) || 0 } })} /></label>
            <label>Free delivery above (₦)<input type="number" value={config.settings.min_order_free_delivery ?? 50000} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, min_order_free_delivery: Number(e.target.value) || 0 } })} /></label>
            <label>Support phone<input value={config.settings.support_phone || ''} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, support_phone: e.target.value } })} /></label>
            <label>Support WhatsApp<input value={config.settings.support_whatsapp || ''} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, support_whatsapp: e.target.value } })} /></label>
            <label>Support email<input value={config.settings.support_email || ''} onChange={(e) => setConfig({ ...config, settings: { ...config.settings, support_email: e.target.value } })} /></label>
            <hr />
            <h3>Sales goals</h3>
            <label>Daily revenue target (₦)<input type="number" value={config.goals.daily_revenue ?? 150000} onChange={(e) => setConfig({ ...config, goals: { ...config.goals, daily_revenue: Number(e.target.value) || 0 } })} /></label>
            <label>Weekly revenue target (₦)<input type="number" value={config.goals.weekly_revenue ?? 1000000} onChange={(e) => setConfig({ ...config, goals: { ...config.goals, weekly_revenue: Number(e.target.value) || 0 } })} /></label>
            <label>Monthly orders target<input type="number" value={config.goals.monthly_orders ?? 80} onChange={(e) => setConfig({ ...config, goals: { ...config.goals, monthly_orders: Number(e.target.value) || 0 } })} /></label>
          </div>
          <button className="btn" type="button" onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
          {message && <p className="muted">{message}</p>}
          <p className="muted" style={{ marginTop: 12 }}>
            Cloud save requires the <code>store_settings</code> table. Run <code>docs/ADMIN-SETTINGS.sql</code> in the Supabase SQL editor if needed.
          </p>
        </div>
      )}
    </div>
  );
}
