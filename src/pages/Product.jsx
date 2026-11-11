import { Link, useParams } from 'react-router-dom';
import { useCatalog, formatNaira } from '../catalog';

export default function Product() {
  const { id } = useParams();
  const { products, loading, error } = useCatalog();
  const product = products.find((item) => item.id === id);

  if (loading) return <div className="wrap page"><p className="muted">Loading product…</p></div>;
  if (error) return <div className="wrap page"><h1>Product unavailable</h1><p className="muted">{error}</p><Link to="/shop">Return to shop</Link></div>;
  if (!product) return <div className="wrap page"><h1>Product not found</h1><p className="muted">This product may have been unpublished or is no longer available.</p><Link to="/shop">Browse the collection</Link></div>;

  return (
    <div className="wrap page">
      <Link to="/shop" className="small">← Back to shop</Link>
      <div className="pdp" style={{ marginTop: 16 }}>
        <div className="photo pdp-photo" role="img" aria-label={`Product photograph pending for ${product.name}`}>
          <span className="photo-tag">{product.category || 'RAW HAIRS'}</span>
          {product.stock <= 0 && <span className="soldout">SOLD OUT</span>}
        </div>
        <div className="stack">
          <p className="eyebrow">{product.category || 'THE COLLECTION'}</p>
          <h1>{product.name}</h1>
          <span className="price" style={{ fontSize: 26 }}>{formatNaira(product.price)}</span>
          <span className="muted small">{product.stock <= 0 ? 'Currently sold out' : product.stock <= 2 ? 'Limited availability' : 'In stock'}</span>
          {product.description && <div><h2 style={{ fontSize: 22 }}>Product details</h2><p>{product.description}</p></div>}
          <div className="notice">Online ordering is not active yet. Contact RAW HAIRS to enquire about availability while checkout is being completed.</div>
          <Link to="/help/contact" className="btn btn-primary btn-lg">ENQUIRE ABOUT THIS WIG</Link>
          <div className="trust" style={{ gridTemplateColumns: '1fr' }}>
            <Link to="/help/delivery">Delivery and shipping</Link>
            <Link to="/help/returns">Returns and refunds</Link>
            <Link to="/help/contact">Need help? Contact us</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
