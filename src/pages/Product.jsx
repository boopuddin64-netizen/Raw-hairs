import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCatalog, formatNaira, hideBrokenImage, productSpec } from '../catalog';
import { useStore, isSoldOut, stockLabel } from '../store';
import { useToast } from '../components';
import { onSwipe, enablePinchZoom } from '../gestures';

export default function Product() {
  const { id } = useParams();
  const { products, loading, error } = useCatalog();
  const store = useStore();
  const [qty, setQty] = useState(1);
  const [length, setLength] = useState(null);
  const [lace, setLace] = useState('');
  const [show, toast] = useToast();
  const photoRef = useRef(null);
  const product = products.find((item) => item.id === id || item.slug === id);

  const images = product
    ? [product.image_url, ...(product.gallery || [])].filter(Boolean)
    : [];
  const [idx, setIdx] = useState(0);

  useEffect(() => setIdx(0), [id]);

  const lengthOptions = product?.length_options?.length ? product.length_options : [];
  const laceOptions = product?.lace_options || [];
  useEffect(() => {
    if (!product) return;
    setLength(product.base_length || lengthOptions[0] || null);
    setLace((product.lace_options || [])[0] || '');
    setQty(1);
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = photoRef.current;
    if (!el || images.length === 0) return;
    const cleanSwipe = onSwipe(el, {
      onLeft: () => setIdx((i) => (i + 1) % images.length),
      onRight: () => setIdx((i) => (i - 1 + images.length) % images.length),
    });
    const cleanZoom = enablePinchZoom(el);
    return () => {
      cleanSwipe();
      cleanZoom();
    };
  }, [images.length, id]);

  if (loading) {
    return (
      <div className="wrap page" aria-busy="true" aria-label="Loading product">
        <div className="pdp" style={{ marginTop: 16 }}>
          <div className="photo pdp-photo" />
          <div className="stack">
            <span className="photo-tag" style={{ width: 120, height: 14 }} />
            <span className="photo-tag" style={{ width: 200, height: 26 }} />
            <span className="photo-tag" style={{ width: 160, height: 18 }} />
          </div>
        </div>
      </div>
    );
  }
  if (error) return <div className="wrap page"><h1>Product unavailable</h1><p className="muted">{error}</p><Link to="/shop">Return to shop</Link></div>;
  if (!product) return <div className="wrap page"><h1>Product not found</h1><p className="muted">This product may have been unpublished or is no longer available.</p><Link to="/shop">Browse the collection</Link></div>;

  const out = isSoldOut(product);
  const maxQty = Math.max(1, product.stock || 1);
  const currentImage = images[idx] || product.image_url;

  const add = () => {
    const variant = [length ? `${length}″` : null, lace || null].filter(Boolean).join(' · ') || null;
    const result = store.addToCart(product, variant, qty);
    show(result.message);
  };

  return (
    <div className="wrap page">
      <Link to="/shop" className="small">← Back to shop</Link>
      <div className="pdp" style={{ marginTop: 16 }}>
        <div
          ref={photoRef}
          className="photo pdp-photo"
          role={currentImage ? undefined : 'img'}
          aria-label={currentImage ? undefined : `Product photograph pending for ${product.name}`}
        >
          {currentImage && <img src={currentImage} alt={product.name} onError={hideBrokenImage} />}
          <span className="photo-tag">{product.category || 'RAW HAIRS'}</span>
          {out && <span className="soldout">SOLD OUT</span>}
          {images.length > 1 && (
            <span className="photo-tag" style={{ left: 'auto', right: 8, bottom: 8 }}>
              {idx + 1} / {images.length}
            </span>
          )}
        </div>
        {images.length > 1 && (
          <div className="thumbs" style={{ marginTop: 8 }}>
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                className="photo"
                style={{ flex: '0 0 64px', height: 80, border: i === idx ? '2px solid var(--pink)' : undefined }}
                onClick={() => setIdx(i)}
                aria-label={`View image ${i + 1}`}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="stack">
          <p className="eyebrow">{product.category || 'THE COLLECTION'}</p>
          <h1>{product.name}</h1>
          <span className="price" style={{ fontSize: 26 }}>{formatNaira(product.price)}</span>
          <span className="muted small">{stockLabel(product)}</span>
          {(productSpec(product) || product.hair_type) && (
            <span className="muted small">{[product.hair_type, productSpec(product) && `Listed at ${productSpec(product)}`].filter(Boolean).join(' · ')}</span>
          )}
          {product.description && (
            <div>
              <h2 style={{ fontSize: 22 }}>Product details</h2>
              <p>{product.description}</p>
            </div>
          )}

          {!out && (
            <div className="stack" style={{ gap: 12 }}>
              {lengthOptions.length > 0 && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Length</label>
                  <div className="tabs" role="group" aria-label="Choose length">
                    {lengthOptions.map((len) => (
                      <button key={len} type="button" className="tab" aria-pressed={length === len} onClick={() => setLength(len)}>{len}″</button>
                    ))}
                  </div>
                </div>
              )}
              {laceOptions.length > 0 && (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Lace</label>
                  <div className="tabs" role="group" aria-label="Choose lace">
                    {laceOptions.map((opt) => (
                      <button key={opt} type="button" className="tab" aria-pressed={lace === opt} onClick={() => setLace(opt)}>{opt}</button>
                    ))}
                  </div>
                </div>
              )}
              {product.base_length && <p className="muted small" style={{ margin: 0 }}>Price is listed at {product.base_length}″. We confirm the exact piece on WhatsApp before it is packed.</p>}
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Quantity</label>
                <div className="qty">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                  <span>{qty}</span>
                  <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
                </div>
              </div>
              <button className="btn btn-primary btn-lg" type="button" onClick={add}>
                ADD TO BAG
              </button>
            </div>
          )}

          {out && (
            <button className="btn btn-disabled" disabled>SOLD OUT</button>
          )}

          <div className="notice">
            Swipe the photo left or right to change images. Pinch to zoom.
          </div>

          <Link to="/help/contact" className="btn btn-outline">ENQUIRE ABOUT THIS WIG</Link>
          <div className="trust" style={{ gridTemplateColumns: '1fr' }}>
            <Link to="/help/delivery">Delivery and shipping</Link>
            <Link to="/help/returns">Returns and refunds</Link>
            <Link to="/help/contact">Need help? Contact us</Link>
          </div>
        </div>
      </div>
      {toast}
    </div>
  );
}
