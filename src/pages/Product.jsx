import { Fragment, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore, naira, stockLabel, isSoldOut } from '../store';
import { categories } from '../data';
import { Photo, useToast } from '../components';

// Swipeable gallery. Uses p.photos (array of image URLs) when a product has several photos;
// until then it shows the single demo image. Native scroll-snap gives swipe on touch devices.
function Gallery({ p, out }) {
  const slides = p.photos && p.photos.length ? p.photos : [null];
  const track = useRef(null);
  const [i, setI] = useState(0);
  const go = (n) => { const el = track.current; if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' }); };
  const onScroll = () => { const el = track.current; if (el && el.clientWidth) setI(Math.round(el.scrollLeft / el.clientWidth)); };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.min(slides.length - 1, i + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.max(0, i - 1)); }
  };
  return (
    <div className="gallery">
      <div className="gallery-track" ref={track} onScroll={onScroll} onKeyDown={onKey} tabIndex={slides.length > 1 ? 0 : -1} role="group" aria-roledescription="carousel" aria-label={`${p.name} photos`}>
        {slides.map((src, n) => (
          <div className="gallery-slide" key={n} role="group" aria-roledescription="slide" aria-label={`${n + 1} of ${slides.length}`}>
            <Photo label={`${p.name} photo ${n + 1}`} src={src || undefined} className="pdp-photo">{out && n === 0 && <span className="soldout">SOLD OUT</span>}</Photo>
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="gallery-dots">
          {slides.map((_, n) => <button key={n} type="button" className="gallery-dot" aria-label={`Show photo ${n + 1}`} aria-current={n === i} onClick={() => go(n)}><span /></button>)}
        </div>
      )}
    </div>
  );
}

export default function Product() {
  const { id } = useParams();
  const store = useStore();
  const nav = useNavigate();
  const p = store.product(id);
  const [length, setLength] = useState(null);
  const [qty, setQty] = useState(1);
  const [toast, toastNode] = useToast();

  if (!p) return <div className="wrap page"><h1>Wig not found</h1><Link to="/shop" className="tap">Back to shop</Link></div>;
  const out = isSoldOut(p);
  const len = length ?? p.lengths[Math.min(1, p.lengths.length - 1)];
  const cat = categories.find((c) => c.id === p.category);

  const add = () => {
    const r = store.addToCart(p.id, len, qty);
    toast(r.message);
    return r.ok;
  };

  return (
    <div className="wrap page">
      <Link to="/shop" className="small tap">← Back to shop</Link>
      <div className="pdp" style={{ marginTop: 12 }}>
        <Gallery p={p} out={out} />
        <div className="stack">
          <p className="eyebrow">{cat ? cat.name : ''}</p>
          <h1>{p.name}</h1>
          <div><span className="price" style={{ fontSize: 26 }}>{naira(p.price)}</span> <span className="muted small">Price in Naira · fees shown at checkout</span></div>
          <span style={{ color: out ? 'var(--bad)' : p.stock <= 2 ? 'var(--warn)' : 'var(--ok)' }}>● {stockLabel(p)}</span>

          {!out && (
            <>
              <div>
                <div style={{ marginBottom: 10 }}>Length: <b>{len} in</b></div>
                <div className="opts" role="group" aria-label="Length">
                  {p.lengths.map((l) => <button key={l} className="opt" aria-pressed={l === len} onClick={() => setLength(l)}>{l} in</button>)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Quantity</span>
                <div className="qty">
                  <button aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                  <span>{qty}</span>
                  <button aria-label="Increase quantity" onClick={() => setQty(Math.min(p.stock, qty + 1))}>+</button>
                </div>
              </div>
            </>
          )}

          {out
            ? <button className="btn btn-disabled btn-lg" disabled>Sold out</button>
            : <>
                <button className="btn btn-primary btn-lg" onClick={add}>Add to bag</button>
                <button className="btn btn-outline btn-lg" onClick={() => { if (add()) nav('/cart'); }}>Buy now</button>
              </>}

          <div>
            <h2 style={{ fontSize: 26, marginBottom: 12 }}>Details</h2>
            <dl className="specs">{p.details.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
            <p className="muted small" style={{ marginTop: 12 }}>Sample values. The owner enters the real specifications.</p>
          </div>
          <div className="trust" style={{ gridTemplateColumns: '1fr' }}>
            <Link to="/help/delivery">Delivery and shipping</Link>
            <Link to="/help/returns">Returns and refunds</Link>
            <Link to="/help/contact">Need help? Contact us</Link>
          </div>
        </div>
      </div>
      {toastNode}
    </div>
  );
}
