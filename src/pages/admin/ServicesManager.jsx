import { useState } from 'react';
import { adminApi } from '../../lib/adminApi';

const blank = () => ({ id: null, name: '', description: '', price: '', duration_minutes: '', is_active: true });
const money = (value) => value == null || value === '' ? 'Price on request' : `₦${Number(value).toLocaleString('en-NG')}`;
const errorText = (error) => error?.message || 'Could not save the service.';

export default function ServicesManager({ services = [], refresh }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const open = (service) => { setError(''); setMessage(''); setForm(service ? { ...service, price: service.price ?? '', duration_minutes: service.duration_minutes ?? '' } : blank()); };

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim()) { setError('Enter a service name.'); return; }
    const price = form.price === '' ? null : Number(form.price);
    const duration = form.duration_minutes === '' ? null : Number(form.duration_minutes);
    if (price != null && (!Number.isFinite(price) || price < 0)) { setError('Enter a valid price.'); return; }
    if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) { setError('Duration must be between 1 and 1,440 minutes.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const values = { name: form.name.trim(), description: form.description.trim() || null, price, duration_minutes: duration, is_active: form.is_active };
      await adminApi.mutate('services', form.id ? 'update' : 'insert', { id: form.id || undefined, values });
      setMessage('Service saved to the store database.');
      setForm(null);
      refresh?.();
    } catch (saveError) { setError(errorText(saveError)); }
    finally { setBusy(false); }
  }

  async function toggle(service) {
    setBusy(true); setError(''); setMessage('');
    try {
      await adminApi.mutate('services', 'update', { id: service.id, values: { is_active: !service.is_active } });
      setMessage(service.is_active ? 'Service hidden from customer booking.' : 'Service published for customer booking.');
      refresh?.();
    } catch (toggleError) { setError(errorText(toggleError)); }
    finally { setBusy(false); }
  }

  const activeCount = services.filter((service) => service.is_active).length;
  return (
    <div className="services-manager">
      <div className="services-manager-intro"><div><p className="eyebrow">CUSTOMER BOOKING MENU</p><h2>Services</h2><p className="muted small">Edit the service details customers see. Changes are saved to the database; future booking checks use the active service and its duration.</p></div><button type="button" className="btn btn-primary" onClick={() => open(null)}>Add service</button></div>
      <div className="services-summary-strip"><span><strong>{services.length}</strong> total services</span><span><strong>{activeCount}</strong> published</span><span className="muted small">Only published services appear in the customer booking form.</span></div>
      {message && <div className="dash-alert ok" role="status">{message}</div>}
      {error && <div className="dash-alert" role="alert">{error}</div>}
      {form && <form className="dash-panel service-editor" onSubmit={save}>
        <div className="dash-panel-head"><div><p className="eyebrow">DATABASE EDITOR</p><h3>{form.id ? 'Edit service' : 'New service'}</h3></div><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
        <div className="pm-grid">
          <div className="field"><label htmlFor="service-name">Service name</label><input id="service-name" required maxLength={160} value={form.name} onChange={(event) => set('name', event.target.value)} /></div>
          <div className="field"><label htmlFor="service-price">Price (₦) · optional</label><input id="service-price" type="number" min="0" step="1" value={form.price} onChange={(event) => set('price', event.target.value)} placeholder="Price on request" /></div>
          <div className="field"><label htmlFor="service-duration">Duration (minutes) · optional</label><input id="service-duration" type="number" min="1" max="1440" step="1" value={form.duration_minutes} onChange={(event) => set('duration_minutes', event.target.value)} placeholder="Not set" /></div>
        </div>
        <div className="field"><label htmlFor="service-description">Description</label><textarea id="service-description" rows="4" maxLength={6000} value={form.description} onChange={(event) => set('description', event.target.value)} /></div>
        <label className="pm-check"><input type="checkbox" checked={form.is_active} onChange={(event) => set('is_active', event.target.checked)} /> Published in customer booking list</label>
        <p className="muted small">The database confirms whether a selected service is still active and checks the requested booking time. Editing duration changes how future time-slot conflicts are evaluated.</p>
        <div className="pm-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save service'}</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
      </form>}
      <div className="service-admin-list">
        {services.map((service) => <article className={`service-admin-row${service.is_active ? '' : ' archived'}`} key={service.id}>
          <div className="service-admin-main"><span className="service-admin-status" aria-label={service.is_active ? 'Published' : 'Hidden'}>{service.is_active ? 'LIVE' : 'HIDDEN'}</span><div><h3>{service.name}</h3><p className="muted small">{service.description || 'No description yet.'}</p><div className="service-admin-meta"><strong>{money(service.price)}</strong>{service.duration_minutes && <span>{service.duration_minutes} min</span>}</div></div></div>
          <div className="service-admin-actions"><button className="btn btn-outline" type="button" disabled={busy} onClick={() => open(service)}>Edit</button><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => toggle(service)}>{service.is_active ? 'Hide' : 'Publish'}</button></div>
        </article>)}
        {!services.length && !form && <div className="empty-shop"><h2>No services yet</h2><p className="muted">Add a service to make it available on the customer booking page.</p><button className="btn btn-primary" type="button" onClick={() => open(null)}>Add first service</button></div>}
      </div>
    </div>
  );
}
