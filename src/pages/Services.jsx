import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useServices, formatNaira } from '../catalog';
import { Chip } from '../components';
import { supabase, supabaseConfigured } from '../lib/supabase';

const BOOKING_ERRORS = {
  sign_in_required: 'Please sign in from the Account page first, then send your booking request.',
  invalid_time: 'Please choose a valid date and time.',
  booking_too_soon: 'Please pick a time at least one hour from now.',
  booking_too_far: 'We take bookings up to 90 days ahead. Please choose a nearer date.',
  missing_details: 'Please fill in your name and WhatsApp number.',
  service_unavailable: 'That service is not available right now. Please pick another.',
  slot_taken: 'That time slot is already taken. Please choose a different time.',
};

export default function Services() {
  const { services, loading, error } = useServices();
  const [form, setForm] = useState({ name: '', whatsapp: '', serviceId: '', message: '', scheduledAt: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      if (!supabaseConfigured || !supabase) throw new Error('Bookings are not connected yet. Please message RAW HAIRS on Instagram or WhatsApp.');
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error(BOOKING_ERRORS.sign_in_required);
      const selected = services.find((service) => service.id === form.serviceId) || services[0];
      const scheduled = form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null;
      const { data, error: rpcError } = await supabase.rpc('create_booking', {
        p_service_id: selected?.id || null,
        p_scheduled_at: scheduled,
        p_customer_name: form.name.trim(),
        p_customer_phone: form.whatsapp.trim(),
        p_notes: form.message.trim() || null,
      });
      if (rpcError) throw rpcError;
      if (!data || data.ok !== true) throw new Error(BOOKING_ERRORS[data?.error] || 'Could not send booking request.');
      setDone(true);
      setForm({ name: '', whatsapp: '', serviceId: '', message: '', scheduledAt: '' });
    } catch (err) {
      setFormError(err?.message || 'Could not send booking request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap page services-page">
      <div className="page-intro">
        <p className="eyebrow">THE RAW HAIRS STUDIO</p>
        <h1>Care &amp; services</h1>
        <p className="muted">Browse the services currently offered. Send a request and our team will confirm the details with you.</p>
      </div>

      {loading && <div className="placeholder-box">Loading current services…</div>}
      {error && <div className="notice auth-error" role="alert">{error}</div>}
      {!loading && !error && services.length === 0 && <div className="empty-shop"><span className="empty-shop-mark">R</span><h2>Services are being updated.</h2><p className="muted">Published services will appear here when available.</p></div>}
      {!loading && !error && services.length > 0 && <div className="services-layout">
        <div className="services-grid">
          {services.map((service, index) => (
            <article key={service.id} className="service-card">
              <span className="service-index">{String(index + 1).padStart(2, '0')}</span>
              <div className="service-card-top"><p className="eyebrow">RAW HAIRS · SERVICE</p><Chip tone="ok">Available to request</Chip></div>
              <h2>{service.name}</h2>
              {service.description && <p className="muted">{service.description}</p>}
              <div className="service-card-meta"><strong>{service.price == null ? 'Price on request' : `From ${formatNaira(service.price)}`}</strong>{service.duration_minutes && <span>{service.duration_minutes} min</span>}</div>
              <a className="service-book-link" href="#book" onClick={() => { setForm((previous) => ({ ...previous, serviceId: service.id })); setDone(false); }}>Request this service <span aria-hidden="true">→</span></a>
            </article>
          ))}
        </div>
        <aside className="service-aside"><img src="/catalogue/care.jpg" alt="Hair care service inspiration" loading="lazy" /><p className="eyebrow">A personal touch</p><h2>Let’s find the right care for your piece.</h2><p className="muted small">Your request is not a confirmed appointment until Raw.hairs replies. The service team will confirm timing and final details.</p></aside>
      </div>}

      <section id="book" className="booking-section">
        <div className="booking-copy"><p className="eyebrow">MAKE A REQUEST</p><h2>Request a booking</h2><p className="muted">Choose a service and preferred time. No payment is taken when you send the request; the team confirms availability.</p></div>
        {done && <div className="notice booking-success" role="status"><strong>Request received.</strong><br />Raw.hairs will confirm the appointment with you.</div>}
        <form onSubmit={submit} className="booking-form">
          <div className="field"><label htmlFor="b-n">Your name</label><input id="b-n" required maxLength={120} value={form.name} onChange={set('name')} autoComplete="name" /></div>
          <div className="field"><label htmlFor="b-w">WhatsApp number</label><input id="b-w" required inputMode="tel" maxLength={30} value={form.whatsapp} onChange={set('whatsapp')} autoComplete="tel" /></div>
          <div className="field"><label htmlFor="b-s">Service</label><select id="b-s" value={form.serviceId} onChange={set('serviceId')} required={services.length > 0}><option value="">Select a service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></div>
          <div className="field"><label htmlFor="b-d">Preferred date &amp; time</label><input id="b-d" type="datetime-local" required value={form.scheduledAt} onChange={set('scheduledAt')} /></div>
          <div className="field"><label htmlFor="b-m">Tell us about your hair piece <span className="muted small">(optional)</span></label><textarea id="b-m" rows="3" maxLength={2000} value={form.message} onChange={set('message')} /></div>
          {formError && <div className="notice auth-error" role="alert">{formError}</div>}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || services.length === 0}>{busy ? 'Sending request…' : 'Send booking request'}</button>
        </form>
        <p className="muted small booking-signin">Booking requests require a customer account. <Link to="/account">Sign in or create an account</Link>.</p>
      </section>
    </div>
  );
}
