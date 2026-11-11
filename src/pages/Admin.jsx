import { useCallback, useEffect, useState } from 'react';
import { Chip } from '../components';
import { useOwnerAuth } from '../auth/OwnerAuth';
import { supabase, supabaseConfigured } from '../lib/supabase';

const TABS = ['Overview', 'Products', 'Services', 'Orders', 'Bookings', 'International', 'Rider jobs'];
const ORDER_STATUSES = ['processing', 'dispatched', 'delivered', 'cancelled'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const REQUEST_STATUSES = ['pending', 'quoted', 'approved', 'declined', 'converted'];
const JOB_STATUSES = ['unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'];

const money = (value) => value == null ? 'Not set' : '₦' + Number(value).toLocaleString('en-NG');
const dateTime = (value) => value ? new Date(value).toLocaleString('en-NG') : 'Not scheduled';
const errorText = (error) => error?.message || 'Something went wrong. Please try again.';
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function StatusSelect({ value, options, onSave, label }) {
  return <select aria-label={label} value={value} onChange={(event) => onSave(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select>;
}

export default function Admin() {
  const { user, signOut } = useOwnerAuth();
  const [tab, setTab] = useState('Overview');
  const [data, setData] = useState({ products: [], services: [], orders: [], bookings: [], requests: [], jobs: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState({ name: '', category: '', description: '', price: '', stock: '0' });
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', price: '', duration_minutes: '' });

  const refresh = useCallback(async () => {
    if (!supabase) { setError('Supabase is not configured in this deployment.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    const tables = [
      ['products', 'products'],
      ['services', 'services'],
      ['orders', 'orders'],
      ['bookings', 'bookings'],
      ['requests', 'international_requests'],
      ['jobs', 'rider_jobs'],
    ];
    const results = await Promise.all(tables.map(async ([key, table]) => {
      const { data: rows, error: queryError } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(200);
      return { key, rows, error: queryError };
    }));
    const failed = results.find((result) => result.error);
    if (failed) {
      setError(failed.error.message + ' (loading ' + failed.key + ')');
      setLoading(false);
      return;
    }
    setData(Object.fromEntries(results.map((result) => [result.key, result.rows || []])));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (key, action) => {
    setBusy(key); setError(''); setNotice('');
    try {
      const { error: actionError } = await action();
      if (actionError) throw actionError;
      setNotice('Saved successfully.');
      await refresh();
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
    const slug = slugify(name) + '-' + Math.random().toString(36).slice(2, 7);
    await run('new-product', () => supabase.from('products').insert({
      name, slug, category: productForm.category.trim() || null,
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
      name: serviceForm.name.trim(), description: serviceForm.description.trim() || null,
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
    await run('image-' + product.id, async () => {
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

  const lowStock = data.products.filter((product) => product.is_active && product.stock > 0 && product.stock <= 2).length;
  const soldOut = data.products.filter((product) => product.stock <= 0).length;
  const openBookings = data.bookings.filter((booking) => ['pending', 'confirmed'].includes(booking.status)).length;
  const pendingRequests = data.requests.filter((request) => request.status === 'pending').length;

  if (!supabaseConfigured) return <div className="wrap page admin-shell"><h1>RAW HAIRS admin</h1><div className="notice">Supabase environment variables are missing. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the deployment before using the admin dashboard.</div></div>;

  return (
    <div className="wrap page">
      <div className="admin-brandbar"><div><p className="eyebrow">RAW HAIRS · PRIVATE BUSINESS PORTAL</p><span className="admin-live"><i /> SECURE OWNER SESSION</span></div><span className="admin-monogram">RH</span></div><p className="eyebrow">OWNER CONTROL CENTRE</p>
      <div className="row-top" style={{ alignItems: 'center' }}>
        <div><h1>Manage RAW HAIRS</h1><p className="muted small">Owner access · {user?.email || 'Authorized owner'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost" onClick={refresh} disabled={loading}>Refresh</button><button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button></div>
      </div>
      <p className="muted small">Changes are saved to the RAW HAIRS Supabase database. New products and services remain hidden from customers until activated.</p>
      {error && <div className="notice auth-error" role="alert" style={{ margin: '12px 0' }}>{error}</div>}
      {notice && <div className="notice" role="status" style={{ margin: '12px 0' }}>{notice}</div>}
      <div className="tabs" role="tablist" aria-label="Admin sections" style={{ overflowX: 'auto' }}>
        {TABS.map((name) => <button key={name} role="tab" aria-selected={tab === name} className="tab" onClick={() => setTab(name)}>{name}</button>)}
      </div>
      {loading ? <p className="muted">Loading live records from Supabase…</p> : <>
        {tab === 'Overview' && <>
          <div className="stats">
            <div className="stat"><span className="muted small">Products</span><b>{data.products.length}</b></div>
            <div className="stat"><span className="muted small">Low stock</span><b style={{ color: 'var(--warn)' }}>{lowStock}</b></div>
            <div className="stat"><span className="muted small">Sold out</span><b style={{ color: 'var(--bad)' }}>{soldOut}</b></div>
            <div className="stat"><span className="muted small">Open bookings</span><b>{openBookings}</b></div>
            <div className="stat"><span className="muted small">Pending international</span><b>{pendingRequests}</b></div>
            <div className="stat"><span className="muted small">Orders</span><b>{data.orders.length}</b></div>
          </div>
          <div className="notice" style={{ marginTop: 16 }}>Database connected. No sample records are inserted automatically; add confirmed RAW HAIRS products and services in their respective sections.</div>
        </>}
        {tab === 'Products' && <div className="stack">
          <h2 style={{ fontSize: 24 }}>Product catalogue</h2>
          <form className="row-card" onSubmit={addProduct} style={{ display: 'grid', gap: 10 }}>
            <h3>Add a product</h3>
            <div className="field"><label>Product name</label><input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
            <div className="field"><label>Category / texture</label><input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="e.g. Body Wave" /></div>
            <div className="field"><label>Description</label><textarea rows="2" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} /></div>
            <div className="field"><label>Price (₦)</label><input required type="number" min="0" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
            <div className="field"><label>Opening stock</label><input type="number" min="0" step="1" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} /></div>
            <button className="btn btn-primary" type="submit" disabled={busy === 'new-product'}>{busy === 'new-product' ? 'Saving…' : 'Add product as hidden'}</button>
          </form>
          {data.products.length === 0 && <p className="muted small">No products in the database yet.</p>}
          <div className="table-wrap"><table><thead><tr><th>Product</th><th>Image</th><th>Price</th><th>Stock</th><th>Visibility</th></tr></thead><tbody>
            {data.products.map((p) => <tr key={p.id}>
              <td><strong>{p.name}</strong><div className="muted small">{p.category || 'Uncategorised'}</div></td>
              <td><label className="small">Upload image<input aria-label={'Image for ' + p.name} type="file" accept="image/*" onChange={(e) => uploadProductImage(p, e.target.files?.[0])} disabled={busy === 'image-' + p.id} /></label>{p.image_path && <span className="muted small">Image saved</span>}</td>
              <td><input aria-label={'Price for ' + p.name} type="number" min="0" step="0.01" defaultValue={p.price} onBlur={(e) => { const value = Number(e.target.value); if (value !== Number(p.price)) updateRow('products', p.id, { price: value }, 'product-' + p.id); }} /></td>
              <td><input aria-label={'Stock for ' + p.name} type="number" min="0" step="1" defaultValue={p.stock} onBlur={(e) => { const value = Math.max(0, Number.parseInt(e.target.value || '0', 10)); if (value !== p.stock) updateRow('products', p.id, { stock: value }, 'stock-' + p.id); }} /></td>
              <td><label className="small"><input type="checkbox" checked={p.is_active} onChange={(e) => updateRow('products', p.id, { is_active: e.target.checked }, 'active-' + p.id)} /> Active</label></td>
            </tr>)}
          </tbody></table></div>
        </div>}
        {tab === 'Services' && <div className="stack">
          <h2 style={{ fontSize: 24 }}>Services</h2>
          <form className="row-card" onSubmit={addService} style={{ display: 'grid', gap: 10 }}>
            <h3>Add a service</h3>
            <div className="field"><label>Service name</label><input required value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} /></div>
            <div className="field"><label>Description</label><textarea rows="2" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} /></div>
            <div className="field"><label>Starting price (₦)</label><input type="number" min="0" step="0.01" value={serviceForm.price} onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })} /></div>
            <div className="field"><label>Duration (minutes)</label><input type="number" min="1" step="1" value={serviceForm.duration_minutes} onChange={(e) => setServiceForm({ ...serviceForm, duration_minutes: e.target.value })} /></div>
            <button className="btn btn-primary" type="submit" disabled={busy === 'new-service'}>{busy === 'new-service' ? 'Saving…' : 'Add service as hidden'}</button>
          </form>
          <div className="table-wrap"><table><thead><tr><th>Service</th><th>Price</th><th>Visibility</th></tr></thead><tbody>
            {data.services.map((s) => <tr key={s.id}>
              <td><strong>{s.name}</strong><div className="muted small">{s.duration_minutes ? s.duration_minutes + ' minutes' : 'Duration not set'}</div></td>
              <td><input aria-label={'Price for ' + s.name} type="number" min="0" step="0.01" defaultValue={s.price ?? ''} onBlur={(e) => { const value = e.target.value === '' ? null : Number(e.target.value); if (value !== s.price) updateRow('services', s.id, { price: value }, 'service-price-' + s.id); }} /></td>
              <td><label className="small"><input type="checkbox" checked={s.is_active} onChange={(e) => updateRow('services', s.id, { is_active: e.target.checked }, 'service-active-' + s.id)} /> Active</label></td>
            </tr>)}
          </tbody></table></div>
        </div>}
        {tab === 'Orders' && <div className="stack"><h2 style={{ fontSize: 24 }}>Customer orders</h2>
          {data.orders.length === 0 && <p className="muted small">No orders received yet.</p>}
          {data.orders.map((o) => <article key={o.id} className="row-card" style={{ display: 'grid', gap: 8 }}>
            <div className="row-top"><strong>Order {o.id.slice(0, 8)}</strong><Chip tone="info">{o.status.replaceAll('_', ' ')}</Chip></div>
            <span className="muted small">Customer ID: {o.customer_id}</span><span>{money(o.total)} · {dateTime(o.created_at)}</span>
            <p className="muted small">Payment state: {o.status === 'awaiting_payment' ? 'Awaiting verified payment' : ['paid', 'refunded'].includes(o.status) ? o.status : 'Payment state is not shown separately'}. Payment confirmation and refunds must be handled by verified payment-server workflows.</p>
            {['paid', 'processing', 'dispatched', 'delivered', 'cancelled'].includes(o.status) && <StatusSelect label="Fulfilment status" value={o.status === 'paid' ? 'processing' : o.status} options={ORDER_STATUSES} onSave={(status) => updateRow('orders', o.id, { status }, 'order-' + o.id)} />}
          </article>)}
        </div>}
        {tab === 'Bookings' && <div className="stack"><h2 style={{ fontSize: 24 }}>Service bookings</h2>
          {data.bookings.length === 0 && <p className="muted small">No bookings received yet.</p>}
          {data.bookings.map((b) => <article key={b.id} className="row-card" style={{ display: 'grid', gap: 6 }}>
            <div className="row-top"><strong>{b.customer_name}</strong><Chip tone="info">{b.status}</Chip></div>
            <span>{b.customer_phone} · {dateTime(b.scheduled_at)}</span><span className="muted small">Service ID: {b.service_id || 'Not specified'}</span>
            {b.notes && <p className="muted small">{b.notes}</p>}
            <StatusSelect label="Booking status" value={b.status} options={BOOKING_STATUSES} onSave={(status) => updateRow('bookings', b.id, { status }, 'booking-' + b.id)} />
          </article>)}
        </div>}
        {tab === 'International' && <div className="stack"><h2 style={{ fontSize: 24 }}>International quote requests</h2>
          {data.requests.length === 0 && <p className="muted small">No international requests received yet.</p>}
          {data.requests.map((r) => <article key={r.id} className="row-card" style={{ display: 'grid', gap: 8 }}>
            <div className="row-top"><strong>{r.customer_name} · {r.destination_country}</strong><Chip tone="info">{r.status}</Chip></div>
            <span className="muted small">{r.customer_email} · {dateTime(r.created_at)}</span>
            {r.request_details && <p className="small">{r.request_details}</p>}
            <div className="field"><label>Quote amount (₦)</label><input type="number" min="0" step="0.01" defaultValue={r.quote_amount ?? ''} onBlur={(e) => { const value = e.target.value === '' ? null : Number(e.target.value); if (value !== r.quote_amount) updateRow('international_requests', r.id, { quote_amount: value, status: value == null ? r.status : 'quoted' }, 'quote-' + r.id); }} /></div>
            <StatusSelect label="Request status" value={r.status} options={REQUEST_STATUSES} onSave={(status) => updateRow('international_requests', r.id, { status }, 'request-' + r.id)} />
          </article>)}
        </div>}
        {tab === 'Rider jobs' && <div className="stack"><h2 style={{ fontSize: 24 }}>Rider job assignments</h2>
          <p className="muted small">Assign a rider using their Supabase Auth user UUID. Rider account provisioning and rider-only sign-in are a separate step; this screen does not create accounts.</p>
          {data.jobs.length === 0 && <p className="muted small">No delivery jobs created yet.</p>}
          {data.jobs.map((job) => <article key={job.id} className="row-card" style={{ display: 'grid', gap: 8 }}>
            <div className="row-top"><strong>Job {job.id.slice(0, 8)}</strong><Chip tone="info">{job.status.replaceAll('_', ' ')}</Chip></div>
            <span className="muted small">Order: {job.order_id}</span>
            <div className="field"><label>Rider user UUID</label><input key={job.id + (job.rider_id || '')} defaultValue={job.rider_id || ''} placeholder="Paste rider auth user UUID" onBlur={(e) => { const value = e.target.value.trim() || null; if (value !== job.rider_id) updateRow('rider_jobs', job.id, { rider_id: value, status: value ? 'assigned' : 'unassigned' }, 'rider-' + job.id); }} /></div>
            <StatusSelect label="Rider job status" value={job.status} options={JOB_STATUSES} onSave={(status) => updateRow('rider_jobs', job.id, { status }, 'job-' + job.id)} />
          </article>)}
        </div>}
      </>}
    </div>
  );
}
