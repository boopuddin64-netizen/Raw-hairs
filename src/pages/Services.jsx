import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices, formatNaira } from '../catalog';
import { Chip } from '../components';
import { supabase, supabaseConfigured } from '../lib/supabase';

export default function Services() {
  const { services, loading, error } = useServices();
  const [form, setForm] = useState({ name: '', whatsapp: '', serviceId: '', message: '', scheduledAt: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      if (!supabaseConfigured || !supabase) {
        throw new Error('Bookings are not connected yet. Please message RAW HAIRS on Instagram or WhatsApp.');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        throw new Error('Please sign in from the Account page first, then send your booking request.');
      }

      const selected = services.find((s) => s.id === form.serviceId) || services[0];
      const scheduled = form.scheduledAt
        ? new Date(form.scheduledAt).toISOString()
        : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase.from('bookings').insert({
        customer_id: user.id,
        service_id: selected?.id || null,
        customer_name: form.name.trim(),
        customer_phone: form.whatsapp.trim(),
        scheduled_at: scheduled,
        status: 'pending',
        notes: form.message.trim() || null,
      });
      if (insertError) throw insertError;

      setDone(true);
      setForm({ name: '', whatsapp: '', serviceId: '', message: '', scheduledAt: '' });
    } catch (err) {
      setFormError(err?.message || 'Could not send booking request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap page">
      <h1>Wig services</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Bring your wig in, or send us a request. We will confirm the price and the date with you.
      </p>

      {loading && <div className="placeholder-box">Loading services…</div>}
      {error && <div className="notice auth-error" role="alert">{error}</div>}

      {!loading && !error && services.length === 0 && (
        <div className="placeholder-box">
          <span className="big">Services coming soon.</span>
          <span className="muted small">Published services will appear here.</span>
        </div>
      )}

      {!loading && services.length > 0 && (
        <div className="stack services-grid">
          {services.map((s) => (
            <article key={s.id} className="card">
              <div className="card-body" style={{ gap: 8, padding: 16 }}>
                <div className="row-top">
                  <h2 style={{ fontSize: 26 }}>{s.name}</h2>
                  <Chip tone="ok">Available</Chip>
                </div>
                {s.description && <p className="muted small" style={{ fontSize: 14 }}>{s.description}</p>}
                <span className="price">From {formatNaira(s.price)}</span>
                {s.duration_minutes && (
                  <span className="muted small">{s.duration_minutes} minutes</span>
                )}
                <a
                  className="btn btn-primary"
                  href="#book"
                  onClick={() => setForm((f) => ({ ...f, serviceId: s.id }))}
                >
                  Book or enquire
                </a>
              </div>
            </article>
          ))}
        </div>
      )}

      <section id="book" style={{ paddingTop: 24, maxWidth: 560 }}>
        <h2 style={{ fontSize: 28, marginBottom: 4 }}>Request a booking</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>Sending this does not charge you. Sign in from Account first.</p>
        {done && (
          <div className="notice" role="status" style={{ marginBottom: 16 }}>
            Booking request received. RAW HAIRS will confirm on WhatsApp.
          </div>
        )}
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="b-n">Your name</label>
            <input id="b-n" required value={form.name} onChange={set('name')} />
          </div>
          <div className="field">
            <label htmlFor="b-w">WhatsApp number</label>
            <input id="b-w" required inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} />
          </div>
          <div className="field">
            <label htmlFor="b-s">Service</label>
            <select
              id="b-s"
              value={form.serviceId}
              onChange={set('serviceId')}
              required={services.length > 0}
            >
              <option value="">Select a service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-d">Preferred date / time (optional)</label>
            <input id="b-d" type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} />
          </div>
          <div className="field">
            <label htmlFor="b-m">Tell us about your wig</label>
            <textarea id="b-m" rows="3" value={form.message} onChange={set('message')} />
          </div>
          {formError && <div className="notice auth-error" role="alert" style={{ marginBottom: 12 }}>{formError}</div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || services.length === 0}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </form>
        <p className="muted small" style={{ marginTop: 12 }}>
          No account yet? <Link to="/account">Create one on the Account page</Link>.
        </p>
      </section>
    </div>
  );
}
