import { useMemo, useRef, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { LiveProductCard, useCatalog } from '../catalog';
import { onPullToRefresh } from '../gestures';

const slug = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Shop() {
  const { products, productTypes, categories, loading, error, refresh } = useCatalog();
  const [params, setParams] = useSearchParams();
  const [ptr, setPtr] = useState(false);
  const pageRef = useRef(null);
  const type = params.get('type') || 'all';
  const cat = params.get('cat') || 'all';
  const q = (params.get('q') || '').trim().toLowerCase();
  const sort = params.get('sort') || 'new';
  const updateParam = (key, value) => {
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

  const filteredCategories = categories.filter((category) => {
    if (type === 'all') return true;
    const selectedType = productTypes.find((item) => item.slug === type || item.id === type);
    return !category.product_type_id || !selectedType || category.product_type_id === selectedType.id;
  });

  const list = useMemo(() => {
    let rows = [...products];
    if (type !== 'all') {
      const selectedType = productTypes.find((item) => item.slug === type || item.id === type);
      if (selectedType) rows = rows.filter((product) => product.product_type_id === selectedType.id || product.product_type_slug === selectedType.slug);
    }
    if (cat !== 'all') rows = rows.filter((product) => product.category_id === cat || slug(product.category_label || product.category) === cat);
    if (q) rows = rows.filter((product) => [product.name, product.category_label, product.category, product.product_type_name, product.description, ...Object.values(product.attributes || {})].filter((value) => value != null).join(' ').toLowerCase().includes(q));
    if (sort === 'low') rows.sort((a, b) => Number(a.price ?? Infinity) - Number(b.price ?? Infinity));
    if (sort === 'high') rows.sort((a, b) => Number(b.price ?? -1) - Number(a.price ?? -1));
    return rows;
  }, [products, productTypes, type, cat, q, sort]);

  return (
    <div className="wrap page shop-page" ref={pageRef}>
      <div className={`ptr-indicator ${ptr ? 'visible' : ''}`} role="status">Refreshing the live catalogue…</div>
      <div className="page-intro">
        <p className="eyebrow">THE RAW HAIRS COLLECTION</p>
        <h1>Shop hair &amp; accessories</h1>
        <p className="muted">Browse the pieces currently published by Raw.hairs. Product details and availability come from the live catalogue.</p>
      </div>

      <form role="search" onSubmit={(event) => event.preventDefault()} className="shop-search">
        <label htmlFor="shop-q" className="sr-only">Search hair and accessories</label>
        <span aria-hidden="true" className="shop-search-icon">⌕</span>
        <input id="shop-q" placeholder="Search hair, accessories, texture or style…" value={params.get('q') || ''} onChange={(event) => updateParam('q', event.target.value)} />
        {(params.get('q') || '') && <button type="button" className="search-clear" onClick={() => updateParam('q', '')} aria-label="Clear search">×</button>}
      </form>

      {productTypes.length > 1 && (
        <div className="filter-section">
          <span className="filter-label">Shop by type</span>
          <div className="tabs" role="group" aria-label="Filter by product type">
            <button type="button" className="tab" aria-pressed={type === 'all'} onClick={() => { updateParam('type', 'all'); updateParam('cat', 'all'); }}>All products</button>
            {productTypes.map((productType) => <button key={productType.id} type="button" className="tab" aria-pressed={type === productType.slug || type === productType.id} onClick={() => { updateParam('type', productType.slug || productType.id); updateParam('cat', 'all'); }}>{productType.name}</button>)}
          </div>
        </div>
      )}

      {filteredCategories.length > 0 && (
        <div className="filter-section">
          <span className="filter-label">Category</span>
          <div className="tabs" role="group" aria-label="Filter by category">
            <button type="button" className="tab" aria-pressed={cat === 'all'} onClick={() => updateParam('cat', 'all')}>All categories</button>
            {filteredCategories.map((category) => <button key={category.id} type="button" className="tab" aria-pressed={cat === category.slug} onClick={() => updateParam('cat', category.slug)}>{category.name}</button>)}
          </div>
        </div>
      )}

      <div className="shop-results-bar">
        <span className="muted small">{loading ? 'Loading live catalogue…' : `${list.length} ${list.length === 1 ? 'item' : 'items'}`}</span>
        <label className="sort-select">Sort
          <select value={sort} onChange={(event) => updateParam('sort', event.target.value)}>
            <option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option>
          </select>
        </label>
      </div>

      {loading && <div className="grid" aria-busy="true" aria-label="Loading the catalogue">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="shop-skeleton" />)}</div>}
      {!loading && error && <div className="notice auth-error" role="alert">{error}</div>}
      {!loading && !error && list.length === 0 && <div className="empty-shop"><span className="empty-shop-mark">R</span><h2>{products.length ? 'No matches just yet.' : 'The collection is being prepared.'}</h2><p className="muted">{products.length ? 'Try another category or search term.' : 'Published products will appear here as the live catalogue is updated.'}</p>{(q || cat !== 'all' || type !== 'all') && <button type="button" className="btn btn-outline" onClick={() => setParams({})}>Clear filters</button>}</div>}
      {!loading && !error && list.length > 0 && <div className="grid product-grid">{list.map((product) => <LiveProductCard key={product.id} product={product} />)}</div>}
      <div className="shop-footnote"><span className="eyebrow">A note from Raw.hairs</span><p className="muted small">The catalogue is updated from the store database. Stock and final pricing are confirmed again when you begin checkout.</p><Link to="/">Back to home</Link></div>
    </div>
  );
}
