import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, naira, stockLabel } from '../store';
import { supabase, supabaseConfigured } from '../lib/supabase';

export default function Cart() {
  const store = useStore();
  const { cart } = store;
  const [dest, setDest] = useState('ng');
  const [sent, setSent] = useState(false);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', whatsapp: '', email: '', country: '', address: '', details: '' });

  const lines = cart;
  const allPriced = lines.length > 0 && lines.every((l) => l.price != null);
  const subtotal = lines.reduce((a, l) => a + (Number(l.price) || 0) * l.qty, 0);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submitIntl = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!supabaseConfigured || !supabase) {
        throw new Error('Online requests are not connected yet. Please message RAW HAIRS on WhatsApp or Instagram.');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) {
        throw new Error('Please sign in from the Account page first, then send your international request.');
      }
      const requestDetails = [
        form.details || '',
        '',
        'Cart items:',
        ...lines.map((l) => `- ${l.name}${l.length ? ` · ${l.length}` : ''} × ${l.qty}`),
        '',
        `WhatsApp: ${form.whatsapp}`,
        `Address: ${form.address}`,
      ].join('\n');

      const { error: insertError } = await supabase.from('international_requests').insert({
        customer_id: user.id,
        customer_name: form.name.trim(),
        customer_email: form.email.trim() || user.email || '',
        destination_country: form.country.trim(),
        request_details: requestDetails,
        status: 'pending',
      });
      if (insertError) throw insertError;
      setSent(true);
      store.clearCart();
    } catch (err) {
      setError(err?.message || 'Could not send request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (lines.length === 0 && !sent) {
    return (
      <div className="wrap page">
        <h1>Your bag</h1>
        <div className="placeholder-box" style={{ marginTop: 16 }}>
          <span className="big">Your bag is empty.</span>
          <Link to="/shop" className="btn btn-primary" style={{ marginTop: 8, alignSelf: 'flex-start' }}>Shop collection</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page">
      <h1>Your bag</h1>
      <p className="muted small" style={{ marginBottom: 16 }}>{lines.reduce((a, l) => a + l.qty, 0)} items</p>
      <div className="cart-grid">
        <div className="stack">
          {lines.map((l) => (
            <article key={l.id + String(l.length)} className="row-card">
              <div className="photo" style={{ flex: '0 0 84px', height: 104 }}>
                {l.image_url
                  ? <img src={l.image_url} alt={l.name} />
                  : <span className="photo-tag">{l.name}</span>}
              </div>
              <div className="row-main">
                <div className="row-top">
                  <h3>{l.name}</h3>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${l.name}`}
                    style={{ margin: '-10px -10px 0 0' }}
                    onClick={() => store.removeLine(l.id, l.length)}
                  >✕</button>
                </div>
                <span className="muted small">{l.category || 'Wig'}{l.length ? ` · ${l.length}` : ''}</span>
                <span className="small" style={{ color: l.qty >= l.stock ? 'var(--warn)' : 'var(--ok)' }}>
                  {l.qty >= l.stock ? `${stockLabel(l)}. Quantity is at the limit.` : 'In stock'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <div className="qty">
                    <button aria-label="Decrease quantity" onClick={() => store.setQty(l.id, l.length, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => store.setQty(l.id, l.length, l.qty + 1)}>+</button>
                  </div>
                  <span className="price">{naira(l.price == null ? null : l.price * l.qty)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18, fontFamily: 'var(--sans)', fontWeight: 500 }}>Where are we delivering?</h2>
          <div className="seg" role="group" aria-label="Delivery destination">
            <button type="button" aria-pressed={dest === 'ng'} onClick={() => setDest('ng')}>Within Nigeria</button>
            <button type="button" aria-pressed={dest === 'intl'} onClick={() => setDest('intl')}>Outside Nigeria</button>
          </div>
          {dest === 'intl' && (
            <p className="muted small">
              Outside Nigeria, you send a request. We agree the shipping cost and timing with you on WhatsApp first.
              You are not charged for shipping automatically.
            </p>
          )}

          <div className="summary">
            <div className="line"><span className="muted">Subtotal</span><span>{allPriced ? naira(subtotal) : 'Price on request'}</span></div>
            <div className="line"><span className="muted">Delivery</span><span>{dest === 'ng' ? 'Calculated at checkout' : 'Agreed with you first'}</span></div>
            <div className="line total"><span>Total</span><span className="price">{allPriced && dest === 'ng' ? naira(subtotal) : 'Price on request'}</span></div>
          </div>
          <p className="muted small">All prices in Nigerian naira. Stock is checked again when you pay.</p>

          {dest === 'ng' && (
            <>
              <button
                className="btn btn-primary btn-lg btn-block"
                type="button"
                onClick={() => setInfo('Online checkout with Paystack is the next step. Your bag is saved in this browser until payment is connected.')}
              >
                Checkout
              </button>
              <span className="muted small" style={{ textAlign: 'center' }}>Payment is not live yet. Your bag stays on this device.</span>
            </>
          )}

          {dest === 'intl' && !sent && (
            <form onSubmit={submitIntl}>
              <div className="field"><label htmlFor="i-n">Your name</label><input id="i-n" required value={form.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="i-e">Email</label><input id="i-e" type="email" required value={form.email} onChange={set('email')} /></div>
              <div className="field"><label htmlFor="i-w">WhatsApp number (with country code)</label><input id="i-w" required inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} /></div>
              <div className="field"><label htmlFor="i-c">Country</label><input id="i-c" required value={form.country} onChange={set('country')} /></div>
              <div className="field"><label htmlFor="i-a">Delivery address</label><textarea id="i-a" rows="3" required value={form.address} onChange={set('address')} /></div>
              <div className="field"><label htmlFor="i-d">Extra notes (optional)</label><textarea id="i-d" rows="2" value={form.details} onChange={set('details')} /></div>
              {error && <div className="notice auth-error" role="alert">{error}</div>}
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send international request'}
              </button>
              <p className="muted small">You need to be signed in (Account page) so we can attach the request to your profile.</p>
            </form>
          )}

          {sent && (
            <div className="notice" role="status">
              Request received. RAW HAIRS will contact you on WhatsApp to agree shipping before any payment.
            </div>
          )}
          {info && <div className="notice" role="status">{info}</div>}
        </div>
      </div>
    </div>
  );
}
