import { useMemo, useRef, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { categories } from '../data';
import { LiveProductCard, useCatalog } from '../catalog';
import { onPullToRefresh } from '../gestures';

const slug = (value) => (value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Shop() {
  const { products, loading, error, refresh } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [ptr, setPtr] = useState(false);
  const pageRef = useRef(null);
  const cat = params.get('cat') || 'all';
  const q = (params.get('q') || '').trim().toLowerCase();
  const sort = params.get('sort') || 'new';
  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key); else next.set(key, value);
    setParams(next);
  };

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    return onPullToRefresh(el, {
      onRefresh: async () => {
        setPtr(true);
        if (typeof refresh === 'function') await refresh();
        else window.location.reload();
        setTimeout(() => setPtr(false), 600);
      },
    });
  }, [refresh]);

  const list = useMemo(() => {
    let rows = products.filter((p) => cat === 'all' || slug(p.category) === cat);
    if (q) rows = rows.filter((p) => [p.name, p.category, p.description].filter(Boolean).join(' ').toLowerCase().includes(q));
    if (sort === 'low') rows = [...rows].sort((a, b) => Number(a.price ?? Infinity) - Number(b.price ?? Infinity));
    if (sort === 'high') rows = [...rows].sort((a, b) => Number(b.price ?? -1) - Number(a.price ?? -1));
    return rows;
  }, [products, cat, q, sort]);

  return (
    <div className="wrap page" ref={pageRef}>
      <div className={`ptr-indicator ${ptr ? 'visible' : ''}`}>Refreshing…</div>
      <p className="eyebrow">THE RAW HAIRS COLLECTION</p>
      <h1>Shop all wigs</h1>
      <p className="muted">Browse the products currently published by RAW HAIRS. Pull down to refresh.</p>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="field">
        <label htmlFor="shop-q" className="sr-only">Search wigs</label>
        <input id="shop-q" placeholder="Search by style, texture or description" value={params.get('q') || ''} onChange={(e) => set('q', e.target.value)} />
      </form>
      <div className="tabs" role="group" aria-label="Filter by style">
        {[{ id: 'all', name: 'All styles' }, ...categories].map((c) => (
          <button key={c.id} type="button" className="tab" aria-pressed={cat === c.id} onClick={() => set('cat', c.id)}>{c.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0 14px' }}>
        <span className="muted small">{loading ? 'Loading catalogue…' : `${list.length} product${list.length === 1 ? '' : 's'}`}</span>
        <label className="small muted">Sort{' '}
          <select value={sort} onChange={(e) => set('sort', e.target.value)} style={{ minHeight: 44, background: 'var(--surface)', border: '1px solid var(--line-2)', padding: '0 8px' }}>
            <option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      {loading && <div className="placeholder-box">Loading the latest RAW HAIRS collection…</div>}
      {!loading && error && <div className="notice auth-error" role="alert">{error}</div>}
      {!loading && !error && list.length === 0 && <div className="placeholder-box"><span className="big">No products published yet.</span><span className="muted small">Please check back soon. New products appear here when RAW HAIRS publishes them.</span></div>}
      {!loading && !error && list.length > 0 && <div className="grid">{list.map((p) => <LiveProductCard key={p.id} product={p} />)}</div>}
      <p className="muted small" style={{ marginTop: 20 }}>Online ordering is being prepared. Product browsing is live; checkout is not yet enabled.</p>
      <Link to="/" className="small">Back to home</Link>
    </div>
  );
}
