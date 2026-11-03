import { useState } from 'react';
import { useStore } from '../store';
import { Chip } from '../components';

const TONE = { 'Out for delivery': 'warn', 'Awaiting shipping quote': 'info', Delivered: 'ok' };

export default function Account() {
  const { state } = useStore();
  const [msg, setMsg] = useState('');
  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <p className="eyebrow">My account</p>
      <h1>Welcome back</h1>
      <p className="muted small" style={{ margin: '4px 0 16px' }}>[CUSTOMER NAME] · [EMAIL]</p>

      <div className="notice" style={{ marginBottom: 20 }}>Sign-in is not connected yet. The order list below is sample data to show the layout. When accounts are built, you will only ever see your own orders.</div>

      <form onSubmit={(e) => { e.preventDefault(); setMsg('Registration and sign-in are not connected yet.'); }} style={{ marginBottom: 24 }}>
        <div className="field"><label htmlFor="a-e">Email</label><input id="a-e" type="email" autoComplete="email" /></div>
        <div className="field"><label htmlFor="a-p">Password</label><input id="a-p" type="password" autoComplete="current-password" /></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit">Sign in</button>
          <button className="btn btn-ghost" type="button" onClick={() => setMsg('Registration is not connected yet.')}>Create account</button>
          <button className="btn btn-ghost" type="button" onClick={() => setMsg('Password recovery is not connected yet.')}>Forgot password</button>
        </div>
        {msg && <div className="notice" role="status" style={{ marginTop: 12 }}>{msg}</div>}
      </form>

      <h2 style={{ fontSize: 28, marginBottom: 12 }}>Your orders</h2>
      <div className="stack">
        {state.orders.map((o) => (
          <article key={o.id} className="row-card" style={{ flexDirection: 'column', gap: 8 }}>
            <div className="row-top"><h3>Order {o.id}</h3><Chip tone={TONE[o.status] || 'muted'}>{o.status}</Chip></div>
            <span className="muted small">{o.items}</span>
            <div className="row-top"><span className="muted small">{o.note}</span><span className="price">₦ [AMOUNT]</span></div>
          </article>
        ))}
      </div>
    </div>
  );
}
