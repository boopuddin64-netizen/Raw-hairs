import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chip } from '../components';
import { useStaffAuth } from '../auth/StaffAuth';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { useRealtimeDashboard, buildAnalytics } from '../hooks/useRealtimeDashboard';

const NAV = [
  { id: 'Overview', label: 'Overview' },
  { id: 'Products', label: 'Products' },
  { id: 'Services', label: 'Services' },
  { id: 'Orders', label: 'Orders' },
  { id: 'Bookings', label: 'Bookings' },
  { id: 'International', label: 'International' },
  { id: 'Rider jobs', label: 'Drivers' },
];

const ORDER_STATUSES = ['processing', 'dispatched', 'delivered', 'cancelled'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const REQUEST_STATUSES = ['pending', 'quoted', 'approved', 'declined', 'converted'];
const JOB_STATUSES = ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];

const money = (value) => (value == null ? '—' : '₦' + Number(value).toLocaleString('en-NG'));
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
  const { user, signOut } = useStaffAuth();
  const { data, loading, error, setError, refresh, live, lastEvent, updatedAt } = useRealtimeDashboard();
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState({ name: '', category: '', description: '', price: '', stock: '0' });
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', price: '', duration_minutes: '' });
  const [query, setQuery] = useState('');

  const analytics = useMemo(() => buildAnalytics(data), [data]);

  const run = async (key, action) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      const { error: actionError } = await action();
      if (actionError) throw actionError;
      setNotice('Saved successfully.');
      await refresh({ quiet: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy('');
    }
  };

  const updateRow = (table, id, patch, key) => run(key, () => supabase.from(table).update(patch).eq('id', id));

  const addProduct = async (event) => {
    event.preventDefault();
    const name = productForm.name.trim();
    if (!name) return;
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`;
    await run('new-product', () => supabase.from('products').insert({
      name,
      slug,
      category: productForm.category.trim() || null,
      description: productForm.description.trim() || null,
      price: Number(productForm.price),
      stock: Math.max(0, Number.parseInt(productForm.stock || '0', 10)),
      is_active: false,
    }));
    setProductForm({ name: '', category: '', description: '', price: '', stock: '0' });
  };

  const addService = async (event) => {
    event.preventDefault();
    if (!serviceForm.name.trim()) return;
    await run('new-service', () => supabase.from('services').insert({
      name: serviceForm.name.trim(),
      description: serviceForm.description.trim() || null,
      price: serviceForm.price === '' ? null : Number(serviceForm.price),
      duration_minutes: serviceForm.duration_minutes === '' ? null : Number(serviceForm.duration_minutes),
      is_active: false,
    }));
    setServiceForm({ name: '', description: '', price: '', duration_minutes: '' });
  };

  const uploadProductImage = async (product, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose an image file.'); return; }
    if (file.size > 8 * 1024 * 1024) { setError('Image must be 8 MB or smaller.'); return; }
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
    const path = `${product.id}/${Date.now()}-${safeName}`;
    await run(`image-${product.id}`, async () => {
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) return { error: uploadError };
      const { error: updateError } = await supabase.from('products').update({ image_path: path }).eq('id', product.id);
      if (updateError) {
        await supabase.storage.from('product-images').remove([path]);
        return { error: updateError };
      }
      return { error: null };
    });
  };

  const activeProducts = data.products.filter((p) => p.is_active).length;
  const lowStock = data.products.filter((p) => p.is_active && p.stock > 0 && p.stock <= 2).length;
  const openBookings = data.bookings.filter((b) => ['pending', 'confirmed'].includes(b.status)).length;

  const activity = useMemo(() => {
    const items = [];
    data.orders.slice(0, 5).forEach((o) => items.push({
      id: `o-${o.id}`, kind: 'Order', title: `Order ${o.id.slice(0, 8)}`,
      meta: `${money(o.total)} · ${o.status.replaceAll('_', ' ')}`, at: o.created_at, tone: 'info',
    }));
    data.bookings.slice(0, 5).forEach((b) => items.push({
      id: `b-${b.id}`, kind: 'Booking', title: b.customer_name,
      meta: `${b.status} · ${dateShort(b.scheduled_at)}`, at: b.created_at, tone: 'ok',
    }));
    data.requests.slice(0, 5).forEach((r) => items.push({
      id: `r-${r.id}`, kind: 'International', title: `${r.customer_name} · ${r.destination_country}`,
      meta: r.status, at: r.created_at, tone: 'warn',
    }));
    return items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 8);
  }, [data]);

  const q = query.trim().toLowerCase();
  const filterText = (text) => !q || String(text || '').toLowerCase().includes(q);

  if (!supabaseConfigured) {
    return (
      <div className="wrap page admin-shell">
        <h1>RAW HAIRS admin</h1>
        <div className="notice">Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</div>
      </div>
    );
  }

  return (
    <div className="wrap page admin-shell">
      <header className="dash-top">
        <div className="dash-top-main">
          <div className="dash-brand">
            <span className="admin-monogram">RH</span>
            <div>
              <p className="eyebrow">RAW HAIRS</p>
              <h1 className="dash-title">Command centre</h1>
            </div>
          </div>
          <div className="dash-session">
            <span className={`admin-live${live ? '' : ' is-offline'}`}><i /> {live ? 'Realtime on' : 'Connecting…'}</span>
            {updatedAt && <span className="dash-email">Updated {updatedAt.toLocaleTimeString('en-NG')}</span>}
            <span className="dash-email">{user?.email}</span>
            {lastEvent && <span className="dash-email">Last: {lastEvent.table} · {lastEvent.event}</span>}
          </div>
        </div>
        <div className="dash-actions">
          <Link className="btn btn-ghost" to="/driver">Drivers</Link>
          <Link className="btn btn-ghost" to="/">Storefront</Link>
          <button className="btn btn-ghost" type="button" onClick={() => refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>

      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {notice && <div className="notice dash-ok" role="status">{notice}</div>}

      <nav className="dash-nav" role="tablist" aria-label="Admin sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={`dash-nav-item${tab === item.id ? ' is-active' : ''}`}
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab !== 'Overview' && (
        <div className="dash-toolbar">
          <input className="admin-search" placeholder={`Search ${tab.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      {loading ? (
        <div className="dash-loading">
          <div className="dash-loading-pulse" />
          <p className="muted">Loading live business data…</p>
        </div>
      ) : (
        <>
          {tab === 'Overview' && (
            <div className="dash-overview">
              <section className="dash-kpi-grid">
                <Kpi label="Revenue today" value={money(analytics.revenueToday)} hint={`${analytics.ordersToday} orders`} tone="ok" />
                <Kpi label="Revenue 7 days" value={money(analytics.revenueWeek)} hint={`${analytics.ordersWeek} orders`} tone="info" />
                <Kpi label="All-time paid" value={money(analytics.revenueAll)} hint={`AOV ${money(Math.round(analytics.avgOrderValue))}`} />
                <Kpi label="Paid rate" value={`${analytics.conversionProxy}%`} hint="Paid ÷ all orders" />
                <Kpi label="Active products" value={activeProducts} hint={`${data.products.length} total`} />
                <Kpi label="Open bookings" value={openBookings} tone="ok" />
                <Kpi label="Low stock" value={lowStock} hint="≤ 2 units" tone="warn" />
                <Kpi label="Inventory value" value={money(Math.round(analytics.inventoryValue))} hint="Active stock × price" />
              </section>

              <div className="dash-split">
                <section className="dash-panel">
                  <div className="dash-panel-head">
                    <h2>Orders · last 7 days</h2>
                    <span className="muted small">{live ? 'Live' : 'Connecting'}</span>
                  </div>
                  <div className="analytics-bars" role="img" aria-label="Orders per day">
                    {analytics.series.map((day) => (
                      <div key={day.key} className="analytics-bar-col">
                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar-fill"
                            style={{ height: `${Math.max(6, Math.round((day.orders / analytics.maxOrders) * 100))}%` }}
                            title={`${day.orders} orders · ${money(day.revenue)}`}
                          />
                        </div>
                        <span className="analytics-bar-label">{day.label}</span>
                        <span className="analytics-bar-value">{day.orders}</span>
                      </div>
                    ))}
                  </div>
                  <div className="analytics-status-row">
                    {Object.entries(analytics.orderStatus).map(([status, count]) => (
                      <span key={status} className="analytics-status-chip">{status.replaceAll('_', ' ')} · {count}</span>
                    ))}
                    {Object.keys(analytics.orderStatus).length === 0 && (
                      <span className="muted small">No orders yet — chart fills as sales come in.</span>
                    )}
                  </div>
                </section>

                <section className="dash-panel">
                  <div className="dash-panel-head"><h2>Revenue · last 7 days</h2></div>
                  <div className="analytics-bars analytics-bars-revenue" role="img" aria-label="Revenue per day">
                    {analytics.series.map((day) => (
                      <div key={day.key} className="analytics-bar-col">
                        <div className="analytics-bar-track">
                          <div
                            className="analytics-bar-fill is-revenue"
                            style={{ height: `${Math.max(6, Math.round((day.revenue / analytics.maxRevenue) * 100))}%` }}
                            title={money(day.revenue)}
                          />
                        </div>
                        <span className="analytics-bar-label">{day.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="dash-tip" style={{ marginTop: 14 }}>
                    <p className="eyebrow">Realtime</p>
                    <p className="muted small">
                      Listens to Supabase changes on orders, bookings, products, services, international requests and driver jobs.
                    </p>
                  </div>
                </section>
              </div>

              <div className="dash-split" style={{ marginTop: 14 }}>
                <section className="dash-panel">
                  <div className="dash-panel-head">
                    <h2>Recent activity</h2>
                    <span className="muted small">Auto-updates</span>
                  </div>
                  {activity.length === 0 ? (
                    <p className="muted small dash-empty">No customer activity yet.</p>
                  ) : (
                    <ul className="dash-activity">
                      {activity.map((item) => (
                        <li key={item.id}>
                          <div>
                            <span className={`dash-pill dash-pill-${item.tone}`}>{item.kind}</span>
                            <strong>{item.title}</strong>
                            <span className="muted small">{item.meta}</span>
                          </div>
                          <time className="muted small">{dateShort(item.at)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="dash-panel">
                  <div className="dash-panel-head"><h2>Quick actions</h2></div>
                  <div className="dash-quick">
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('Products')}>Add product</button>
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('Services')}>Add service</button>
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('Orders')}>Review orders</button>
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('Bookings')}>Confirm bookings</button>
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('International')}>Quote international</button>
                    <button type="button" className="dash-quick-btn" onClick={() => setTab('Rider jobs')}>Assign drivers</button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === 'Products' && (
            <div className="dash-section">
              <div className="dash-panel">
                <div className="dash-panel-head"><h2>Add product</h2></div>
                <form className="dash-form" onSubmit={addProduct}>
                  <div className="dash-form-grid">
                    <div className="field"><label>Name</label><input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
                    <div className="field"><label>Category</label><input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="Body Wave" /></div>
                    <div className="field"><label>Price (₦)</label><input required type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
                    <div className="field"><label>Stock</label><input type="number" min="0" step="1" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Description</label><textarea rows="2" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></div>
                  <button className="btn btn-primary" type="submit" disabled={busy === 'new-product'}>{busy === 'new-product' ? 'Saving…' : 'Add as hidden'}</button>
                </form>
              </div>
              <div className="dash-panel">
                <div className="dash-panel-head"><h2>Catalogue</h2><span className="muted small">{data.products.length}</span></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>Image</th><th>Price</th><th>Stock</th><th>Live</th></tr></thead>
                    <tbody>
                      {data.products.filter((p) => filterText(p.name) || filterText(p.category)).map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong><div className="muted small">{p.category || 'Uncategorised'}</div></td>
                          <td>
                            <label className="dash-upload">Upload
                              <input type="file" accept="image/*" aria-label={`Image for ${p.name}`} disabled={busy === `image-${p.id}`} onChange={(e) => uploadProductImage(p, e.target.files?.[0])} />
                            </label>
                            {p.image_path && <span className="muted small"> Saved</span>}
                          </td>
                          <td><input type="number" min="0" step="0.01" defaultValue={p.price} onBlur={(e) => { const v = Number(e.target.value); if (v !== Number(p.price)) updateRow('products', p.id, { price: v }, `product-${p.id}`); }} /></td>
                          <td><input type="number" min="0" step="1" defaultValue={p.stock} onBlur={(e) => { const v = Math.max(0, Number.parseInt(e.target.value || '0', 10)); if (v !== p.stock) updateRow('products', p.id, { stock: v }, `stock-${p.id}`); }} /></td>
                          <td><label className="dash-toggle"><input type="checkbox" checked={p.is_active} onChange={(e) => updateRow('products', p.id, { is_active: e.target.checked }, `active-${p.id}`)} /><span>{p.is_active ? 'On' : 'Off'}</span></label></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'Services' && (
            <div className="dash-section">
              <div className="dash-panel">
                <div className="dash-panel-head"><h2>Add service</h2></div>
                <form className="dash-form" onSubmit={addService}>
                  <div className="dash-form-grid">
                    <div className="field"><label>Name</label><input required value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} /></div>
                    <div className="field"><label>Price (₦)</label><input type="number" min="0" step="0.01" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} /></div>
                    <div className="field"><label>Duration (min)</label><input type="number" min="1" step="1" value={serviceForm.duration_minutes} onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Description</label><textarea rows="2" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} /></div>
                  <button className="btn btn-primary" type="submit" disabled={busy === 'new-service'}>{busy === 'new-service' ? 'Saving…' : 'Add as hidden'}</button>
                </form>
              </div>
              <div className="dash-panel">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Service</th><th>Price</th><th>Live</th></tr></thead>
                    <tbody>
                      {data.services.filter((s) => filterText(s.name)).map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.name}</strong><div className="muted small">{s.duration_minutes ? `${s.duration_minutes} min` : '—'}</div></td>
                          <td><input type="number" min="0" step="0.01" defaultValue={s.price ?? ''} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== s.price) updateRow('services', s.id, { price: v }, `service-price-${s.id}`); }} /></td>
                          <td><label className="dash-toggle"><input type="checkbox" checked={s.is_active} onChange={(e) => updateRow('services', s.id, { is_active: e.target.checked }, `service-active-${s.id}`)} /><span>{s.is_active ? 'On' : 'Off'}</span></label></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'Orders' && (
            <div className="dash-section"><div className="dash-panel">
              <div className="dash-panel-head"><h2>Orders</h2></div>
              <div className="dash-cards">
                {data.orders.filter((o) => filterText(o.id) || filterText(o.status)).map((o) => (
                  <article key={o.id} className="dash-card">
                    <div className="row-top"><strong>#{o.id.slice(0, 8)}</strong><Chip tone="info">{o.status.replaceAll('_', ' ')}</Chip></div>
                    <p className="muted small">{dateTime(o.created_at)}</p>
                    <p className="price">{money(o.total)}</p>
                    {['paid', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(o.status) && (
                      <StatusSelect label="Status" value={o.status === 'paid' ? 'processing' : o.status} options={ORDER_STATUSES} onSave={(status) => updateRow('orders', o.id, { status }, `order-${o.id}`)} />
                    )}
                  </article>
                ))}
              </div>
            </div></div>
          )}

          {tab === 'Bookings' && (
            <div className="dash-section"><div className="dash-panel">
              <div className="dash-panel-head"><h2>Bookings</h2></div>
              <div className="dash-cards">
                {data.bookings.filter((b) => filterText(b.customer_name)).map((b) => (
                  <article key={b.id} className="dash-card">
                    <div className="row-top"><strong>{b.customer_name}</strong><Chip tone="info">{b.status}</Chip></div>
                    <p className="muted small">{b.customer_phone}</p>
                    <p className="small">{dateTime(b.scheduled_at)}</p>
                    <StatusSelect label="Status" value={b.status} options={BOOKING_STATUSES} onSave={(status) => updateRow('bookings', b.id, { status }, `booking-${b.id}`)} />
                  </article>
                ))}
              </div>
            </div></div>
          )}

          {tab === 'International' && (
            <div className="dash-section"><div className="dash-panel">
              <div className="dash-panel-head"><h2>International</h2></div>
              <div className="dash-cards">
                {data.requests.filter((r) => filterText(r.customer_name)).map((r) => (
                  <article key={r.id} className="dash-card">
                    <div className="row-top"><strong>{r.customer_name}</strong><Chip tone="info">{r.status}</Chip></div>
                    <p className="muted small">{r.destination_country} · {r.customer_email}</p>
                    <div className="field"><label>Quote (₦)</label>
                      <input type="number" min="0" step="0.01" defaultValue={r.quote_amount ?? ''} onBlur={(e) => {
                        const value = e.target.value === '' ? null : Number(e.target.value);
                        if (value !== r.quote_amount) updateRow('international_requests', r.id, { quote_amount: value, status: value == null ? r.status : 'quoted' }, `quote-${r.id}`);
                      }} />
                    </div>
                    <StatusSelect label="Status" value={r.status} options={REQUEST_STATUSES} onSave={(status) => updateRow('international_requests', r.id, { status }, `request-${r.id}`)} />
                  </article>
                ))}
              </div>
            </div></div>
          )}

          {tab === 'Rider jobs' && (
            <div className="dash-section"><div className="dash-panel">
              <div className="dash-panel-head"><h2>Driver jobs</h2></div>
              <div className="dash-cards">
                {data.jobs.map((job) => (
                  <article key={job.id} className="dash-card">
                    <div className="row-top"><strong>Job {job.id.slice(0, 8)}</strong><Chip tone="info">{job.status.replaceAll('_', ' ')}</Chip></div>
                    <p className="muted small">Order {job.order_id}</p>
                    <div className="field"><label>Driver UUID</label>
                      <input key={job.id + (job.rider_id || '')} defaultValue={job.rider_id || ''} placeholder="Paste driver auth UUID" onBlur={(e) => {
                        const value = e.target.value.trim() || null;
                        if (value !== job.rider_id) updateRow('rider_jobs', job.id, { rider_id: value, status: value ? 'assigned' : 'unassigned' }, `rider-${job.id}`);
                      }} />
                    </div>
                    <StatusSelect label="Status" value={job.status} options={JOB_STATUSES} onSave={(status) => updateRow('rider_jobs', job.id, { status }, `job-${job.id}`)} />
                  </article>
                ))}
              </div>
            </div></div>
          )}
        </>
      )}
    </div>
  );
}
