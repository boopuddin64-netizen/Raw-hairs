import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCatalog, formatNaira } from '../catalog';
import { useStore, isSoldOut, stockLabel } from '../store';
import { useToast } from '../components';

export default function Product() {
  const { id } = useParams();
  const { products, loading, error } = useCatalog();
  const store = useStore();
  const [qty, setQty] = useState(1);
  const [show, toast] = useToast();
  const product = products.find((item) => item.id === id);

  if (loading) return <div className="wrap page"><p className="muted">Loading product…</p></div>;
  if (error) return <div className="wrap page"><h1>Product unavailable</h1><p className="muted">{error}</p><Link to="/shop">Return to shop</Link></div>;
  if (!product) return <div className="wrap page"><h1>Product not found</h1><p className="muted">This product may have been unpublished or is no longer available.</p><Link to="/shop">Browse the collection</Link></div>;

  const out = isSoldOut(product);
  const maxQty = Math.max(1, product.stock || 1);

  const add = () => {
    const result = store.addToCart(product, null, qty);
    show(result.message);
  };

  return (
    <div className="wrap page">
      <Link to="/shop" className="small">← Back to shop</Link>
      <div className="pdp" style={{ marginTop: 16 }}>
        <div
          className="photo pdp-photo"
          role={product.image_url ? undefined : 'img'}
          aria-label={product.image_url ? undefined : `Product photograph pending for ${product.name}`}
        >
          {product.image_url && <img src={product.image_url} alt={product.name} />}
          <span className="photo-tag">{product.category || 'RAW HAIRS'}</span>
          {out && <span className="soldout">SOLD OUT</span>}
        </div>
        <div className="stack">
          <p className="eyebrow">{product.category || 'THE COLLECTION'}</p>
          <h1>{product.name}</h1>
          <span className="price" style={{ fontSize: 26 }}>{formatNaira(product.price)}</span>
          <span className="muted small">{stockLabel(product)}</span>
          {product.description && (
            <div>
              <h2 style={{ fontSize: 22 }}>Product details</h2>
              <p>{product.description}</p>
            </div>
          )}

          {!out && (
            <div className="stack" style={{ gap: 12 }}>
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
            Checkout is being finalised. You can add items to your bag now; payment with Paystack will be enabled next.
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
