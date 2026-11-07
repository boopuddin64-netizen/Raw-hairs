import { useState } from 'react';
import { useStore, naira } from '../store';
import { Photo, Chip } from '../components';

export default function Services() {
  const store = useStore();
  const services = store.state.services.filter((s) => s.status !== 'hidden');
  const open = services.filter((s) => s.status === 'available');
  const [form, setForm] = useState({ name: '', whatsapp: '', service: '', message: '' });
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    store.addBooking({ ...form, service: form.service || (open[0] && open[0].name) });
    setDone(true);
    setForm({ name: '', whatsapp: '', service: '', message: '' });
  };

  return (
    <div className="wrap page">
      <h1>Wig services</h1>
      <p className="muted" style={{ marginBottom: 16 }}>Bring your wig in, or send us a request. We will confirm the price and the date with you.</p>

      <div className="stack services-grid">
        {services.map((s) => {
          const paused = s.status === 'paused';
          return (
            <article key={s.id} className="card">
              <div style={{ position: 'relative', height: 170, opacity: paused ? 0.6 : 1 }}><Photo label={s.name} className="fill" /></div>
              <div className="card-body" style={{ gap: 8, padding: 16 }}>
                <div className="row-top"><h2 style={{ fontSize: 26 }}>{s.name}</h2><Chip tone={paused ? 'warn' : 'ok'}>{paused ? 'Paused' : 'Available'}</Chip></div>
                <p className="muted small" style={{ fontSize: 14 }}>{s.desc}</p>
                <span className="price">From {naira(s.price)}</span>
                {paused
                  ? <button className="btn btn-disabled" disabled>Temporarily unavailable</button>
                  : <button type="button" className="btn btn-primary" onClick={() => { setForm({ ...form, service: s.name }); const b = document.getElementById('book'); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Book or enquire</button>}
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted small" style={{ margin: '12px 0' }}>Hidden services never appear here. Services do not use product stock numbers.</p>

      <section id="book" style={{ paddingTop: 24, maxWidth: 560 }}>
        <h2 style={{ fontSize: 28, marginBottom: 4 }}>Request a booking</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>Sending this does not charge you.</p>
        {done && <div className="notice" role="status" style={{ marginBottom: 16 }}>Request saved in this demo (this browser only). On the live site RAW HAIRS is notified and replies on WhatsApp.</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="b-n">Your name</label><input id="b-n" required value={form.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="b-w">WhatsApp number</label><input id="b-w" required inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} /></div>
          <div className="field"><label htmlFor="b-s">Service</label>
            <select id="b-s" value={form.service} onChange={set('service')}>
              {open.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="b-m">Tell us about your wig</label><textarea id="b-m" rows="3" value={form.message} onChange={set('message')} /></div>
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={open.length === 0}>Send request</button>
        </form>
      </section>
    </div>
  );
}
