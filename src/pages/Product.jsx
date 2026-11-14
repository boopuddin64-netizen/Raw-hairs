import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCatalog, formatNaira, hideBrokenImage, productSpec } from '../catalog';
import { productImageUrl } from '../lib/images';
import { useStore, isSoldOut, stockLabel } from '../store';
import { useToast } from '../components';
import { onSwipe, enablePinchZoom } from '../gestures';

const displayValue = (value) => typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);

export default function Product() {
  const { id } = useParams();
  const { products, attributeDefinitions, loading, error } = useCatalog();
  const store = useStore();
  const [qty, setQty] = useState(1);
  const [length, setLength] = useState(null);
  const [lace, setLace] = useState('');
  const [show, toast] = useToast();
  const photoRef = useRef(null);
  const product = products.find((item) => item.id === id || item.slug === id);
  const galleryPaths = product
    ? (Array.isArray(product.gallery_paths) ? product.gallery_paths : Array.isArray(product.gallery) ? product.gallery : [])
    : [];
  const images = product
    ? [...new Set([product.image_url, ...galleryPaths.map((path) => productImageUrl(path) || path)].filter(Boolean))]
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
    return () => { cleanSwipe(); cleanZoom(); };
  }, [images.length, id]);

  if (loading) return <div className="wrap page" aria-busy="true" aria-label="Loading product"><div className="pdp" style={{ marginTop: 16 }}><div className="photo pdp-photo" /><div className="stack"><span className="photo-tag" style={{ width: 120, height: 14 }} /><span className="photo-tag" style={{ width: 200, height: 26 }} /><span className="photo-tag" style={{ width: 160, height: 18 }} /></div></div></div>;
  if (error) return <div className="wrap page"><h1>Product unavailable</h1><p className="muted">{error}</p><Link to="/shop">Return to the collection</Link></div>;
  if (!product) return <div className="wrap page"><h1>Product not found</h1><p className="muted">This product may have been unpublished or is no longer available.</p><Link to="/shop">Browse hair &amp; accessories</Link></div>;

  const out = isSoldOut(product);
  const maxQty = Math.max(1, product.stock || 1);
  const currentImage = images[idx] || product.image_url;
  const specs = attributeDefinitions
    .filter((definition) => definition.product_type_id === product.product_type_id && definition.display_in_specs !== false)
    .filter((definition) => product.attributes && product.attributes[definition.key] !== undefined && product.attributes[definition.key] !== null && product.attributes[definition.key] !== '')
    .map((definition) => [definition.label, displayValue(product.attributes[definition.key])]);
  const variantLabel = [length ? `${length}″` : null, lace || null].filter(Boolean).join(' · ') || null;

  const add = () => {
    const result = store.addToCart(product, variantLabel, qty);
    show(result.message);
  };

  return (
    <div className="wrap page product-page">
      <Link to="/shop" className="back-link">← <span>Back to collection</span></Link>
      <div className="pdp" style={{ marginTop: 18 }}>
        <section className="product-gallery" aria-label="Product images">
          <div ref={photoRef} className="photo pdp-photo" role={currentImage ? undefined : 'img'} aria-label={currentImage ? undefined : `Product photograph pending for ${product.name}`}>
            {currentImage && <img src={currentImage} alt={`${product.name} — ${idx === 0 ? 'main product display' : `gallery image ${idx + 1}`}`} onError={hideBrokenImage} />}
            <span className="photo-tag">{product.category_label || product.product_type_name || 'RAW HAIRS'}</span>
            {out && <span className="soldout">SOLD OUT</span>}
            {images.length > 1 && <span className="gallery-count">{idx + 1} / {images.length}</span>}
          </div>
          {images.length > 1 && <div className="thumbs" aria-label="Choose a product image">{images.map((src, i) => <button key={`${src}-${i}`} type="button" className={`gallery-thumb${i === idx ? ' active' : ''}`} onClick={() => setIdx(i)} aria-label={`View product image ${i + 1}`} aria-pressed={i === idx}><img src={src} alt="" /></button>)}</div>}
          <p className="gallery-note">Swipe to view more photos. The main photo shows the product; additional styling images, if provided, follow it.</p>
        </section>

        <section className="product-detail stack">
          <div className="product-kicker"><span className="eyebrow">{product.product_type_name || 'THE COLLECTION'}</span>{product.category_label && <span className="product-category-pill">{product.category_label}</span>}</div>
          <h1>{product.name}</h1>
          <span className="price product-price">{formatNaira(product.price)}</span>
          <span className={`stock-state${out ? ' sold-out' : ''}`}>{stockLabel(product)}</span>
          {(productSpec(product) || product.hair_type) && <p className="muted product-spec-line">{[product.hair_type, productSpec(product) && `Listed at ${productSpec(product)}`].filter(Boolean).join(' · ')}</p>}
          {product.description && <div className="product-description"><h2>Product details</h2><p>{product.description}</p></div>}
          {specs.length > 0 && <dl className="specs product-attributes">{specs.map(([label, value]) => <div className="spec-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}

          {!out && <div className="product-options">
            {lengthOptions.length > 0 && <div className="field option-field"><label>Length</label><div className="tabs" role="group" aria-label="Choose length">{lengthOptions.map((value) => <button key={value} type="button" className="tab" aria-pressed={length === value} onClick={() => setLength(value)}>{value}″</button>)}</div></div>}
            {laceOptions.length > 0 && <div className="field option-field"><label>Lace</label><div className="tabs" role="group" aria-label="Choose lace">{laceOptions.map((value) => <button key={value} type="button" className="tab" aria-pressed={lace === value} onClick={() => setLace(value)}>{value}</button>)}</div></div>}
            {product.base_length && <p className="muted small">Price is listed at {product.base_length}″. The exact item and options are confirmed from the store catalogue during checkout.</p>}
            <div className="field option-field"><label>Quantity</label><div className="qty"><button type="button" aria-label="Decrease quantity" onClick={() => setQty((value) => Math.max(1, value - 1))}>−</button><span>{qty}</span><button type="button" aria-label="Increase quantity" onClick={() => setQty((value) => Math.min(maxQty, value + 1))}>+</button></div></div>
            <button className="btn btn-primary btn-lg btn-block" type="button" onClick={add}>Add to bag</button>
          </div>}
          {out && <button className="btn btn-disabled btn-block" disabled>Sold out</button>}
          <Link to="/help/contact" className="btn btn-outline btn-block">Ask a question</Link>
          <div className="product-trust"><Link to="/help/delivery">Delivery &amp; shipping</Link><Link to="/help/returns">Returns &amp; refunds</Link><Link to="/help/contact">Need help? Contact us</Link></div>
        </section>
      </div>
      {toast}
    </div>
  );
}
