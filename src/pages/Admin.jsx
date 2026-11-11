import { useState } from 'react';
import { useStore, stockLabel } from '../store';
import { Chip } from '../components';
import { useOwnerAuth } from '../auth/OwnerAuth';

const TABS = ['Overview', 'Products', 'Services', 'Requests', 'Riders'];

export default function Admin() {
  const store = useStore();
  const { user, signOut } = useOwnerAuth();
  const { state } = store;
  const [tab, setTab] = useState('Overview');
  const [rider, setRider] = useState('');

  const low = state.products.filter((p) => p.available && p.stock > 0 && p.stock <= 2).length;
  const soldOut = state.products.filter((p) => !p.available || p.stock <= 0).length;

  return (
    <div className="wrap page">
      <p className="eyebrow">Owner admin · demo</p>
      <div className="row-top" style={{ alignItems: "center" }}><div><h1>Manage RAW HAIRS</h1><p className="muted small">Signed in as {user?.email || "authorized owner"}</p></div><button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button></div>
      <div className="notice" style={{ margin: '12px 0 16px' }}>
        Owner access is verified using Firebase Authentication and a server-issued owner claim. Admin data is still demo data stored in this browser; Firestore persistence and audit logging are not enabled yet.
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="stats">
            <div className="stat"><span className="muted small">Products</span><b>{state.products.length}</b></div>
            <div className="stat"><span className="muted small">Low stock</span><b style={{ color: 'var(--warn)' }}>{low}</b></div>
            <div className="stat"><span className="muted small">Sold out or hidden</span><b style={{ color: 'var(--bad)' }}>{soldOut}</b></div>
            <div className="stat"><span className="muted small">Open requests</span><b style={{ color: 'var(--info)' }}>{state.requests.length + state.bookings.length}</b></div>
          </div>
          <button className="btn btn-ghost" onClick={() => { if (window.confirm('Reset all demo data in this browser?')) store.reset(); }}>Reset demo data</button>
        </>
      )}

      {tab === 'Products' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>PRODUCT</th><th>PRICE (₦)</th><th>STOCK</th><th>STATUS</th><th>FEATURED</th><th>AVAILABLE</th></tr></thead>
            <tbody>
              {state.products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><input aria-label={`Price for ${p.name}`} inputMode="numeric" value={p.price ?? ''} placeholder="not set" onChange={(e) => store.patchProduct(p.id, { price: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} /></td>
                  <td><input aria-label={`Stock for ${p.name}`} type="number" min="0" value={p.stock} onChange={(e) => store.patchProduct(p.id, { stock: Math.max(0, parseInt(e.target.value || '0', 10)) })} /></td>
                  <td><Chip tone={!p.available || p.stock <= 0 ? 'muted' : p.stock <= 2 ? 'warn' : 'ok'}>{stockLabel(p)}</Chip></td>
                  <td><input type="checkbox" style={{ width: 24, minHeight: 24 }} aria-label={`Feature ${p.name}`} checked={p.featured} onChange={(e) => store.patchProduct(p.id, { featured: e.target.checked })} /></td>
                  <td><input type="checkbox" style={{ width: 24, minHeight: 24 }} aria-label={`Available: ${p.name}`} checked={p.available} onChange={(e) => store.patchProduct(p.id, { available: e.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ padding: '8px 0' }}>Zero stock shows SOLD OUT on the shop automatically. Real stock history and add/edit/archive of products come with the backend.</p>
        </div>
      )}

      {tab === 'Services' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>SERVICE</th><th>FROM PRICE (₦)</th><th>AVAILABILITY</th></tr></thead>
            <tbody>
              {state.services.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><input aria-label={`Price for ${s.name}`} inputMode="numeric" value={s.price ?? ''} placeholder="not set" onChange={(e) => store.patchService(s.id, { price: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} /></td>
                  <td>
                    <select aria-label={`Availability for ${s.name}`} value={s.status} onChange={(e) => store.setServiceStatus(s.id, e.target.value)}>
                      <option value="available">Available</option>
                      <option value="paused">Temporarily unavailable</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Requests' && (
        <div className="stack">
          <h2 style={{ fontSize: 24 }}>International requests</h2>
          {state.requests.length === 0 && <p className="muted small">None yet. Send one from the cart by choosing "Outside Nigeria".</p>}
          {state.requests.map((r) => (
            <article key={r.id} className="row-card" style={{ flexDirection: 'column', gap: 4 }}>
              <div className="row-top"><h3>{r.id} · {r.country}</h3><Chip tone="info">Awaiting your quote</Chip></div>
              <span className="small">{r.name} · WhatsApp {r.whatsapp}</span>
              <span className="muted small">{r.address}</span>
              <span className="muted small">{r.lines.reduce((a, l) => a + l.qty, 0)} item(s) requested</span>
              <a className="link-btn" style={{ justifyContent: 'flex-start' }} href={`https://wa.me/${r.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer noopener">Open WhatsApp</a>
            </article>
          ))}
          <h2 style={{ fontSize: 24, marginTop: 12 }}>Service bookings</h2>
          {state.bookings.length === 0 && <p className="muted small">None yet.</p>}
          {state.bookings.map((b) => (
            <article key={b.id} className="row-card" style={{ flexDirection: 'column', gap: 4 }}>
              <div className="row-top"><h3>{b.id} · {b.service}</h3><Chip tone="info">New</Chip></div>
              <span className="small">{b.name} · WhatsApp {b.whatsapp}</span>
              <span className="muted small">{b.message}</span>
            </article>
          ))}
        </div>
      )}

      {tab === 'Riders' && (
        <div className="stack" style={{ maxWidth: 560 }}>
          {state.riders.map((r) => (
            <div key={r.id} className="row-card" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <div><h3>{r.name}</h3><span className="muted small">{r.status === 'active' ? 'Active' : r.status === 'invited' ? 'Invited, not yet joined' : 'Deactivated'}</span></div>
              <button className="btn btn-ghost" onClick={() => store.setRiderStatus(r.id, r.status === 'deactivated' ? 'active' : 'deactivated')}>{r.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}</button>
            </div>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (rider.trim()) { store.inviteRider(rider.trim()); setRider(''); } }}>
            <div className="field"><label htmlFor="rn">Rider name</label><input id="rn" value={rider} onChange={(e) => setRider(e.target.value)} /></div>
            <button className="btn btn-outline" type="submit">Invite a rider</button>
          </form>
          <p className="muted small">Real invites are sent by email and riders set up their own sign-in. Not connected in this demo.</p>
        </div>
      )}
    </div>
  );
}
