import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore, naira, stockLabel } from '../store';
import { Photo } from '../components';

export default function Cart() {
  const store = useStore();
  const { state } = store;
  const [dest, setDest] = useState('ng');
  const [sent, setSent] = useState(false);
  const [info, setInfo] = useState('');
  const [removed, setRemoved] = useState(null);
  const undoTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(undoTimer.current), []);
  const [form, setForm] = useState({ name: '', whatsapp: '', country: '', address: '' });

  const lines = state.cart.map((c) => ({ ...c, p: store.product(c.id) })).filter((l) => l.p);
  const allPriced = lines.length > 0 && lines.every((l) => l.p.price != null);
  const subtotal = lines.reduce((a, l) => a + (l.p.price || 0) * l.qty, 0);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const remove = (l) => {
    window.clearTimeout(undoTimer.current);
    setRemoved({ id: l.id, length: l.length, qty: l.qty, name: l.p.name });
    store.removeLine(l.id, l.length);
    undoTimer.current = window.setTimeout(() => setRemoved(null), 8000);
  };
  const undo = () => {
    window.clearTimeout(undoTimer.current);
    const r = store.addToCart(removed.id, removed.length, removed.qty);
    setRemoved(null);
    setInfo(r.ok ? '' : r.message);
  };
  const undoNotice = removed && <div className="notice undo-notice" role="status">Removed {removed.name} from your bag. <button type="button" className="undo-btn" onClick={undo}>Undo</button></div>;

  const submitIntl = (e) => {
    e.preventDefault();
    store.addInternationalRequest(form);
    setSent(true);
  };

  if (lines.length === 0 && !sent) {
    return (
      <div className="wrap page">
        <h1>Your bag</h1>
        {undoNotice}
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
      {undoNotice}
      <p className="muted small" style={{ marginBottom: 16 }}>{lines.reduce((a, l) => a + l.qty, 0)} items</p>
      <div className="cart-grid">
        <div className="stack">
          {lines.map((l) => (
            <article key={l.id + l.length} className="row-card">
              <Photo label={l.p.name} />
              <div className="row-main">
                <div className="row-top">
                  <h3>{l.p.name}</h3>
                  <button className="icon-btn" aria-label={`Remove ${l.p.name}`} style={{ margin: '-10px -10px 0 0' }} onClick={() => remove(l)}>✕</button>
                </div>
                <span className="muted small">{l.length} in · {l.p.spec}</span>
                <span className="small" style={{ color: l.qty >= l.p.stock ? 'var(--warn)' : 'var(--ok)' }}>
                  {l.qty >= l.p.stock ? `${stockLabel(l.p)}. Quantity is at the limit.` : 'In stock'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <div className="qty">
                    <button aria-label="Decrease quantity" onClick={() => store.setQty(l.id, l.length, l.qty - 1)}>−</button>
                    <span>{l.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => store.setQty(l.id, l.length, l.qty + 1)}>+</button>
                  </div>
                  <span className="price">{naira(l.p.price == null ? null : l.p.price * l.qty)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18, fontFamily: 'var(--sans)', fontWeight: 500 }}>Where are we delivering?</h2>
          <div className="seg" role="group" aria-label="Delivery destination">
            <button aria-pressed={dest === 'ng'} onClick={() => setDest('ng')}>Within Nigeria</button>
            <button aria-pressed={dest === 'intl'} onClick={() => setDest('intl')}>Outside Nigeria</button>
          </div>
          {dest === 'intl' && <p className="muted small">Outside Nigeria, you send a request. We agree the shipping cost and timing with you on WhatsApp first. You are not charged for shipping automatically.</p>}

          <div className="summary">
            <div className="line"><span className="muted">Subtotal</span><span>{allPriced ? naira(subtotal) : '₦ [AMOUNT]'}</span></div>
            <div className="line"><span className="muted">Delivery</span><span>{dest === 'ng' ? 'Calculated at checkout' : 'Agreed with you first'}</span></div>
            <div className="line total"><span>Total</span><span className="price">{allPriced && dest === 'ng' ? naira(subtotal) : '₦ [AMOUNT]'}</span></div>
          </div>
          <p className="muted small">All prices in Nigerian naira. Stock is checked again when you pay, so a sold-out item can be removed before you are charged.</p>

          {dest === 'ng' && (
            <>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => setInfo('Online checkout is not connected yet. Paystack payment will be added after the plan is approved.')}>Checkout</button>
              <span className="muted small" style={{ textAlign: 'center' }}>No account needed. You can check out as a guest.</span>
            </>
          )}
          {dest === 'intl' && !sent && (
            <form onSubmit={submitIntl}>
              <div className="field"><label htmlFor="i-n">Your name</label><input id="i-n" required value={form.name} onChange={set('name')} /></div>
              <div className="field"><label htmlFor="i-w">WhatsApp number (with country code)</label><input id="i-w" required inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} /></div>
              <div className="field"><label htmlFor="i-c">Country</label><input id="i-c" required value={form.country} onChange={set('country')} /></div>
              <div className="field"><label htmlFor="i-a">Delivery address</label><textarea id="i-a" rows="3" required value={form.address} onChange={set('address')} /></div>
              <button className="btn btn-primary btn-lg btn-block" type="submit">Send international request</button>
            </form>
          )}
          {sent && <div className="notice" role="status">Request saved in this demo (this browser only). In the real site the owner is notified and contacts you on WhatsApp to agree shipping.</div>}
          {info && <div className="notice" role="status">{info}</div>}
        </div>
      </div>
    </div>
  );
}
