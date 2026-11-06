import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { categories } from '../data';
import { ProductCard, useToast } from '../components';

export default function Shop() {
  const { state } = useStore();
  const [params, setParams] = useSearchParams();
  const [toast, toastNode] = useToast();
  const cat = params.get('cat') || 'all';
  const q = (params.get('q') || '').trim().toLowerCase();
  const sort = params.get('sort') || 'new';

  const set = (k, v) => {
    const next = new URLSearchParams(params);
    if (!v || v === 'all') next.delete(k); else next.set(k, v);
    setParams(next, { replace: k === 'q' });
  };

  let list = state.products.filter((p) => p.available !== undefined);
  if (cat !== 'all') list = list.filter((p) => p.category === cat);
  if (q) list = list.filter((p) => `${p.name} ${p.spec} ${p.details.map((d) => d[1]).join(' ')} ${p.lengths.join(' ')}`.toLowerCase().includes(q));
  if (sort === 'new') list = [...list].sort((a, b) => Number(b.isNew) - Number(a.isNew));
  if (sort === 'low') list = [...list].sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
  if (sort === 'high') list = [...list].sort((a, b) => (b.price ?? -1) - (a.price ?? -1));

  return (
    <div className="wrap page">
      <h1>Shop all wigs</h1>
      <form role="search" onSubmit={(e) => e.preventDefault()} className="field">
        <label htmlFor="shop-q" className="sr-only">Search wigs</label>
        <input id="shop-q" placeholder="Search by style, length or colour" value={params.get('q') || ''} onChange={(e) => set('q', e.target.value)} />
      </form>
      <div className="tabs" role="group" aria-label="Filter by style">
        {[{ id: 'all', name: 'All' }, ...categories].map((c) => (
          <button key={c.id} className="tab" aria-pressed={cat === c.id} onClick={() => set('cat', c.id)}>{c.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 12px' }}>
        <span className="muted small">{list.length} wig{list.length === 1 ? '' : 's'} (sample)</span>
        <label className="small muted">Sort{' '}
          <select value={sort} onChange={(e) => set('sort', e.target.value)} style={{ minHeight: 44, background: 'var(--surface)', border: '1px solid var(--line-2)', padding: '0 8px' }}>
            <option value="new">Newest</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      {list.length === 0
        ? <div className="placeholder-box"><span className="big">No wigs match that search.</span><span className="muted small">Try a different style or clear the search.</span></div>
        : <div className="grid">{list.map((p) => <ProductCard key={p.id} p={p} onAdded={toast} />)}</div>}
      {toastNode}
    </div>
  );
}
