import { useMemo, useState } from 'react';
import { useStore, stockLabel } from '../store';
import { Chip } from '../components';

const NAV = [
  ['Overview', '◫', 'Your business at a glance'],
  ['Products', '◇', 'Catalogue and inventory'],
  ['Services', '✳', 'Bookings and care services'],
  ['Enquiries', '✉', 'Customer requests'],
  ['Orders', '▤', 'Order activity'],
  ['Team', '♙', 'Rider access and dispatch'],
];

function Metric({ label, value, note, icon, tone = '' }) {
  return <article className="adm-metric glass-panel"><div className="adm-metric-top"><span>{label}</span><span className="adm-metric-icon">{icon}</span></div><strong className={tone}>{value}</strong><small>{note}</small></article>;
}
function SectionTitle({ kicker, title, description, action }) {
  return <div className="adm-section-title"><div><span className="adm-kicker">{kicker}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
function Empty({ title, text }) {
  return <div className="adm-empty"><span className="adm-empty-mark">✳</span><strong>{title}</strong><p>{text}</p></div>;
}

export default function Admin({ staffRole = 'manager' }) {
  const store = useStore();
  const { state } = store;
  const [tab, setTab] = useState('Overview');
  const canManageTeam = staffRole === 'owner' || staffRole === 'manager';
  const canManageCatalogue = staffRole === 'owner' || staffRole === 'manager';
  const canManageServices = staffRole === 'owner' || staffRole === 'manager';
  const canManageInventory = ['owner', 'manager', 'operations'].includes(staffRole);
  const visibleNav = NAV.filter(([name]) => name !== 'Team' || canManageTeam);
  const [query, setQuery] = useState('');
  const [riderName, setRiderName] = useState('');
  const [notice, setNotice] = useState('');
  const low = state.products.filter((p) => p.available && p.stock > 0 && p.stock <= 2).length;
  const soldOut = state.products.filter((p) => !p.available || p.stock <= 0).length;
  const openRequests = state.requests.length + state.bookings.length;
  const filteredProducts = useMemo(() => state.products.filter((p) => (p.name + ' ' + p.category).toLowerCase().includes(query.toLowerCase())), [state.products, query]);
  const setDemoNotice = (message) => { setNotice(message); window.setTimeout(() => setNotice(''), 2800); };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="#/"><span className="admin-brand-symbol">R</span><span><b>RAW HAIRS</b><small>STUDIO / CONTROL</small></span></a>
        <div className="admin-workspace"><span className="admin-avatar">RH</span><span><b>{staffRole.charAt(0).toUpperCase() + staffRole.slice(1)} workspace</b><small>Demo environment</small></span><span className="admin-live-dot" /></div>
        <span className="admin-nav-label">WORKSPACE</span>
        <nav className="admin-nav" aria-label="Admin navigation">
          {visibleNav.map(([name, icon, desc]) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setQuery(''); }} title={desc}><span className="admin-nav-icon">{icon}</span><span>{name}</span>{name === 'Enquiries' && openRequests > 0 && <i>{openRequests}</i>}</button>)}
        </nav>
        <div className="admin-sidebar-bottom"><div className="admin-demo-note"><span className="admin-live-dot" /> DEMO MODE <p>All changes stay in this browser.</p></div><a href="#/" className="admin-back-link">↗ View customer storefront</a></div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar"><div className="admin-breadcrumb"><span>Workspace</span><b>/</b><strong>{tab}</strong></div><div className="admin-top-actions"><span className="admin-date-label">PREVIEW ENVIRONMENT</span><span className="admin-owner-pill"><span className="admin-avatar small-avatar">{staffRole.slice(0,1).toUpperCase()}</span> {staffRole}</span></div></header>
        <div className="admin-content">
          <div className="admin-welcome"><div><span className="adm-kicker">THURSDAY, YOUR STUDIO OVERVIEW</span><h1>{tab === 'Overview' ? 'Good day. Here’s your overview.' : tab}</h1><p>{tab === 'Overview' ? 'A clear picture of your RAW HAIRS demo store, all in one place.' : NAV.find((item) => item[0] === tab)?.[2]}</p></div><div className="admin-welcome-actions"><span className="admin-status-pill"><i /> Prototype active</span><button className="adm-button ghost" onClick={() => { store.reset(); setDemoNotice('Demo data has been reset in this browser.'); }}>↻ Reset demo</button></div></div>
          {notice && <div className="adm-toast" role="status">{notice}</div>}

          {tab === 'Overview' && <>
            <div className="adm-metrics-grid">
              <Metric label="Catalogue items" value={state.products.length} note="Across all sample collections" icon="◇" />
              <Metric label="Low stock alerts" value={low} note="Items with 1–2 units remaining" icon="!" tone="warning-text" />
              <Metric label="Unavailable items" value={soldOut} note="Sold out or hidden from shop" icon="◌" tone="muted-text" />
              <Metric label="Open enquiries" value={openRequests} note="Bookings and international requests" icon="✉" tone="accent-text" />
            </div>
            <div className="adm-overview-grid">
              <section className="glass-panel adm-panel"><SectionTitle kicker="INVENTORY HEALTH" title="Stock overview" description="A live view of sample stock levels." action={<button className="adm-text-button" onClick={() => setTab('Products')}>Manage inventory ↗</button>} />
                <div className="adm-stock-list">{state.products.slice(0, 5).map((p) => <div className="adm-stock-row" key={p.id}><span className="adm-product-swatch">{p.name.slice(0, 1)}</span><span className="adm-stock-name"><b>{p.name}</b><small>{p.spec}</small></span><div className="adm-stock-meter"><i style={{ width: Math.min(100, p.stock / 8 * 100) + '%' }} /></div><strong>{p.stock} <small>units</small></strong><Chip tone={!p.available || p.stock === 0 ? 'muted' : p.stock <= 2 ? 'warn' : 'ok'}>{stockLabel(p)}</Chip></div>)}</div>
              </section>
              <section className="glass-panel adm-panel"><SectionTitle kicker="QUICK ACTIONS" title="Studio shortcuts" description="Jump into common management tasks." />
                <div className="adm-shortcuts"><button onClick={() => setTab('Products')}><span>◇</span><b>Update catalogue</b><small>Prices, stock and visibility</small><i>↗</i></button><button onClick={() => setTab('Services')}><span>✳</span><b>Manage services</b><small>Availability and starting prices</small><i>↗</i></button><button onClick={() => setTab('Enquiries')}><span>✉</span><b>Review enquiries</b><small>Bookings and shipping requests</small><i>↗</i></button>{canManageTeam && <button onClick={() => setTab('Team')}><span>♙</span><b>Manage delivery team</b><small>Rider status and invitations</small><i>↗</i></button>}</div>
              </section>
            </div>
            <section className="glass-panel adm-panel adm-activity"><SectionTitle kicker="RECENT ACTIVITY" title="Order pulse" description="Sample order activity for the client walkthrough." action={<button className="adm-text-button" onClick={() => setTab('Orders')}>View all orders ↗</button>} />
              <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>ORDER</th><th>ITEM</th><th>STATUS</th><th>PAYMENT / NOTE</th></tr></thead><tbody>{(state.orders || []).slice(0, 4).map((o) => <tr key={o.id}><td><b>{o.id}</b></td><td>{o.items}</td><td><Chip tone={o.status === 'Delivered' ? 'ok' : 'info'}>{o.status}</Chip></td><td>{o.note}</td></tr>)}</tbody></table></div>
            </section>
            <p className="adm-footnote">Illustrative prototype data only. Revenue, conversion and customer analytics will be connected after the business rules and backend are approved.</p>
          </>}

          {tab === 'Products' && <section className="glass-panel adm-panel"><SectionTitle kicker="CATALOGUE CONTROL" title="Products & inventory" description="Edit sample product prices, stock and storefront visibility." action={<span className="adm-count">{state.products.length} sample items</span>} /><div className="adm-toolbar"><label className="adm-search">⌕ <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products or categories" /></label><span className="adm-hint">Edits update the customer storefront instantly.</span></div><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>PRODUCT</th><th>PRICE (₦)</th><th>STOCK</th><th>STATUS</th><th>FEATURED</th><th>VISIBLE</th></tr></thead><tbody>{filteredProducts.map((p) => <tr key={p.id}><td><div className="adm-product-cell"><span className="adm-product-swatch">{p.name.slice(0, 1)}</span><span><b>{p.name}</b><small>{p.spec} · {p.lengths.join(', ')} in</small></span></div></td><td><input className="adm-input" aria-label={'Price for ' + p.name} inputMode="numeric" value={p.price ?? ''} placeholder="Not set" disabled={!canManageCatalogue} onChange={(e) => store.patchProduct(p.id, { price: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} /></td><td><input className="adm-input compact" aria-label={'Stock for ' + p.name} type="number" min="0" value={p.stock} disabled={!canManageInventory} onChange={(e) => store.patchProduct(p.id, { stock: Math.max(0, parseInt(e.target.value || '0', 10)) })} /></td><td><Chip tone={!p.available || p.stock <= 0 ? 'muted' : p.stock <= 2 ? 'warn' : 'ok'}>{stockLabel(p)}</Chip></td><td><input type="checkbox" aria-label={'Feature ' + p.name} checked={p.featured} disabled={!canManageCatalogue} onChange={(e) => store.patchProduct(p.id, { featured: e.target.checked })} /></td><td><input type="checkbox" aria-label={'Show ' + p.name} checked={p.available} disabled={!canManageCatalogue} onChange={(e) => store.patchProduct(p.id, { available: e.target.checked })} /></td></tr>)}</tbody></table></div>{filteredProducts.length === 0 && <Empty title="No matching products" text="Try another product name or category." />}<p className="adm-footnote">Product creation, image uploads, variants, bulk actions and stock history are backend-phase decisions.</p></section>}

          {tab === 'Services' && <section className="glass-panel adm-panel"><SectionTitle kicker="SERVICE MENU" title="Care & styling services" description="Control the services customers can enquire about." /><div className="adm-service-grid">{state.services.map((s) => <article className="adm-service-card" key={s.id}><div className="adm-service-symbol">✳</div><div><b>{s.name}</b><p>{s.desc}</p></div><label>Starting price <input className="adm-input" inputMode="numeric" aria-label={'Price for ' + s.name} value={s.price ?? ''} placeholder="Not set" disabled={!canManageServices} onChange={(e) => store.patchService(s.id, { price: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })} /></label><label>Visibility<select className="adm-input" value={s.status} disabled={!canManageServices} onChange={(e) => store.setServiceStatus(s.id, e.target.value)}><option value="available">Available</option><option value="paused">Temporarily unavailable</option><option value="hidden">Hidden</option></select></label></article>)}</div></section>}

          {tab === 'Enquiries' && <div className="adm-overview-grid"><section className="glass-panel adm-panel"><SectionTitle kicker="CROSS-BORDER" title="International requests" description="Customers asking for a shipping quote." />{state.requests.length === 0 ? <Empty title="No shipping requests yet" text="International cart requests will appear here in the demo." /> : state.requests.map((r) => <article className="adm-request-card" key={r.id}><div><b>{r.id} · {r.country}</b><Chip tone="info">Awaiting quote</Chip></div><p>{r.name} · {r.whatsapp}</p><small>{r.address}</small><small>{r.lines.reduce((a, l) => a + l.qty, 0)} item(s)</small><a href={'https://wa.me/' + r.whatsapp.replace(/[^0-9]/g, '')} target="_blank" rel="noreferrer noopener">Open WhatsApp ↗</a></article>)}</section><section className="glass-panel adm-panel"><SectionTitle kicker="WIG CARE" title="Service bookings" description="Incoming customer booking requests." />{state.bookings.length === 0 ? <Empty title="No bookings yet" text="New service enquiries from the customer site will appear here." /> : state.bookings.map((b) => <article className="adm-request-card" key={b.id}><div><b>{b.id} · {b.service}</b><Chip tone="info">New</Chip></div><p>{b.name} · {b.whatsapp}</p><small>{b.message || 'No extra details provided.'}</small></article>)}</section></div>}

          {tab === 'Orders' && <section className="glass-panel adm-panel"><SectionTitle kicker="FULFILMENT" title="Orders" description="A sample order ledger for the customer journey walkthrough." /><div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>ORDER</th><th>ITEMS</th><th>FULFILMENT</th><th>PAYMENT</th></tr></thead><tbody>{(state.orders || []).map((o) => <tr key={o.id}><td><b>{o.id}</b></td><td>{o.items}</td><td><Chip tone={o.status === 'Delivered' ? 'ok' : 'info'}>{o.status}</Chip></td><td>{o.note}</td></tr>)}</tbody></table></div><p className="adm-footnote">Order status changes, refunds, payment reconciliation and customer notifications are not connected in this prototype.</p></section>}

          {tab === 'Team' && canManageTeam && <div className="adm-overview-grid"><section className="glass-panel adm-panel"><SectionTitle kicker="DELIVERY NETWORK" title="Rider roster" description="Manage the sample delivery team." />{state.riders.map((r) => <div className="adm-team-row" key={r.id}><span className="adm-avatar">{r.name.slice(0, 1).toUpperCase()}</span><span><b>{r.name}</b><small>{r.status === 'active' ? 'Active rider' : r.status === 'invited' ? 'Invitation pending' : 'Access deactivated'}</small></span><Chip tone={r.status === 'active' ? 'ok' : r.status === 'invited' ? 'info' : 'muted'}>{r.status}</Chip><button className="adm-button ghost" onClick={() => store.setRiderStatus(r.id, r.status === 'deactivated' ? 'active' : 'deactivated')}>{r.status === 'deactivated' ? 'Reactivate' : 'Deactivate'}</button></div>)}<form className="adm-invite-form" onSubmit={(e) => { e.preventDefault(); if (riderName.trim()) { store.inviteRider(riderName.trim()); setRiderName(''); setDemoNotice('Rider added to the local demo roster.'); } }}><label htmlFor="adm-rider-name">Add a rider to the demo roster</label><div><input id="adm-rider-name" className="adm-input" value={riderName} onChange={(e) => setRiderName(e.target.value)} placeholder="Rider display name" /><button className="adm-button primary" type="submit">Add rider +</button></div></form></section><section className="glass-panel adm-panel"><SectionTitle kicker="DISPATCH PREVIEW" title="Delivery activity" description="Sample jobs currently visible in the driver demo." />{state.jobs.map((j) => <div className="adm-job-row" key={j.id}><span><b>{j.id}</b><small>{j.customer} · {j.pack}</small></span><Chip tone={j.step >= 3 ? 'ok' : 'info'}>{['Assigned','Picked up','On the way','Delivered'][j.step]}</Chip></div>)}<a className="adm-text-button" href="#/rider">Open driver portal ↗</a></section></div>}
        </div>
      </main>
    </div>
  );
}
