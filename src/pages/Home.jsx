import { Link } from 'react-router-dom';
import { categories, INSTAGRAM_URL, policyLinks } from '../data';
import { LiveProductCard, useCatalog } from '../catalog';

const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;
const categoryImages = {
  'bone-straight': pexels(6923383),
  'body-wave': pexels(6923442),
  'loose-wave': pexels(6923442),
  'deep-wave': pexels(6923442),
  'water-wave': pexels(6923442),
  'curly': pexels(6923442),
  'colored': pexels(6923557),
  'lace': pexels(6923383),
  'ready-units': pexels(6923351),
};
const slug = (value) => (value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Home() {
  const { products, loading, error } = useCatalog();
  const arrivals = products.slice(0, 4);
  const tileImage = (c) => products.find((p) => slug(p.category) === c.id && p.image_url)?.image_url || categoryImages[c.id] || categoryImages.curly;
  const tileFallback = (c) => (event) => { const fb = categoryImages[c.id] || categoryImages.curly; if (event.currentTarget.src !== fb) event.currentTarget.src = fb; };

  return (
    <>
      <section className="hero">
        <div className="hero-note">RAW HAIRS COLLECTION</div>
        <div className="hero-visual">
          <img src="https://images.pexels.com/photos/6923383/pexels-photo-6923383.jpeg" alt="Hair extension styling inspiration" fetchPriority="high" />
          <span>THE ART OF GREAT HAIR</span>
        </div>
        <div className="hero-inner">
          <p className="eyebrow">The collection</p>
          <h1>Your Crown.<br />Your Confidence.</h1>
          <p className="lead">Wigs made to be worn, loved and noticed. Explore the current RAW HAIRS collection.</p>
          <div className="hero-actions">
            <Link to="/shop" className="btn btn-primary btn-lg">Shop collection</Link>
            <Link to="/services" className="btn btn-outline btn-lg">Explore our services</Link>
          </div>
        </div>
      </section>
      <div className="wrap">
        <section className="section" aria-labelledby="h-style">
          <div className="section-head"><h2 id="h-style">Shop by style</h2></div>
          <div className="hscroll cats">
            {categories.map((c) => <Link key={c.id} to={`/shop?cat=${c.id}`} className="cat">
              <span className="photo"><img src={tileImage(c)} alt={`${c.name} hair`} loading="lazy" onError={tileFallback(c)} /></span>{c.name}
            </Link>)}
            <Link to="/shop" className="cat"><span className="photo"><img src="https://images.pexels.com/photos/6923383/pexels-photo-6923383.jpeg" alt="Latest hair collection inspiration" loading="lazy" /></span>New arrivals</Link>
          </div>
          <p className="muted small image-note">Style inspiration photography. Actual product images will be shown on each product listing.</p>
        </section>
        <section className="section" aria-labelledby="h-new">
          <div className="section-head"><h2 id="h-new">The collection</h2><Link to="/shop">View all</Link></div>
          {loading && <div className="placeholder-box">Loading the latest collection…</div>}
          {error && <div className="notice auth-error" role="alert">{error}</div>}
          {!loading && !error && arrivals.length === 0 && <div className="placeholder-box"><span className="big">New pieces are coming soon.</span><span className="muted small">Our latest products will appear here once published.</span></div>}
          {!loading && !error && arrivals.length > 0 && <div className="grid">{arrivals.map((p) => <LiveProductCard key={p.id} product={p} />)}</div>}
        </section>
        <section className="section" aria-labelledby="h-svc">
          <div className="section-head"><h2 id="h-svc">Wig services</h2><Link to="/services">All services</Link></div>
          <div className="service-image-band">
            <img src="https://images.pexels.com/photos/6923414/pexels-photo-6923414.jpeg" alt="A woman brushing and caring for a wig" loading="lazy" />
            <div><span className="eyebrow">Care for every crown</span><h3>Care, revamps and customization.</h3><p className="muted">Explore our services or contact RAW HAIRS for availability and pricing.</p><Link to="/services" className="btn btn-outline">Explore services</Link></div>
          </div>
        </section>
        <section className="section" aria-labelledby="h-ig">
          <div className="section-head"><h2 id="h-ig">Follow RAW HAIRS</h2></div>
          <p className="note">@raw.hairs on Instagram</p>
          <a className="btn btn-outline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">View on Instagram</a>
        </section>
        <section className="section" aria-labelledby="h-trust">
          <div className="section-head"><h2 id="h-trust" style={{ fontSize: 28 }}>Shop with confidence</h2></div>
          <div className="trust">{policyLinks.map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}</div>
        </section>
        <p className="muted small photo-credit">Editorial and style-inspiration images via <a href="https://www.pexels.com/@rdne/" target="_blank" rel="noreferrer noopener">RDNE Stock project on Pexels</a>. Pexels license: free commercial use.</p>
      </div>
    </>
  );
}
