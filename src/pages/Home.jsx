import { Link } from 'react-router-dom';
import { LiveProductCard, useCatalog } from '../catalog';
import { INSTAGRAM_URL, policyLinks } from '../data';
import { BrandLogo } from '../components';

const slug = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Home() {
  const { products, categories, loading, error } = useCatalog();
  const arrivals = products.slice(0, 4);
  const categoryTiles = categories.slice(0, 8).map((category) => ({
    ...category,
    product: products.find((product) => product.category_id === category.id || slug(product.category_label || product.category) === category.slug),
  }));

  return (
    <>
      <section className="hero home-hero">
        <img className="home-hero-image" src="/catalogue/hero.jpg" alt="Raw hair bundle displayed on a dark surface" fetchPriority="high" />
        <div className="home-hero-shade" />
        <div className="hero-inner">
          <div className="hero-brand"><BrandLogo /></div>
          <p className="eyebrow">Raw beauty. Real you.</p>
          <h1>Your crown.<br /><em>Your confidence.</em></h1>
          <p className="lead">Explore the current Raw.hairs collection of hair and accessories, photographed as the pieces you will receive.</p>
          <div className="hero-actions">
            <Link to="/shop" className="btn btn-primary btn-lg">Shop the collection</Link>
            <Link to="/services" className="btn btn-outline btn-lg">Explore services</Link>
          </div>
        </div>
        <span className="hero-note">PRODUCT-FIRST PHOTOGRAPHY · NIGERIA</span>
      </section>

      <div className="wrap">
        <section className="section" aria-labelledby="h-style">
          <div className="section-head"><div><p className="eyebrow">Explore by category</p><h2 id="h-style">Find your texture</h2></div><Link to="/shop">Shop everything</Link></div>
          {categoryTiles.length > 0 ? (
            <div className="hscroll cats">
              {categoryTiles.map((category) => (
                <Link key={category.id} to={`/shop?cat=${encodeURIComponent(category.slug)}`} className="cat">
                  <span className="photo">
                    {category.product?.image_url && <img src={category.product.image_url} alt={`${category.name} product display`} loading="lazy" />}
                    {!category.product?.image_url && <span className="category-initial">{category.name.slice(0, 1)}</span>}
                  </span>
                  <span>{category.name}</span>
                </Link>
              ))}
            </div>
          ) : <p className="muted small">Published categories appear here as the catalogue is updated.</p>}
        </section>

        <section className="section" aria-labelledby="h-new">
          <div className="section-head"><div><p className="eyebrow">From the live catalogue</p><h2 id="h-new">The collection</h2></div><Link to="/shop">View all</Link></div>
          {loading && <div className="placeholder-box">Loading the latest collection…</div>}
          {error && <div className="notice auth-error" role="alert">{error}</div>}
          {!loading && !error && arrivals.length === 0 && <div className="placeholder-box"><span className="big">New pieces are coming soon.</span><span className="muted small">Published products will appear here automatically.</span></div>}
          {!loading && !error && arrivals.length > 0 && <div className="grid">{arrivals.map((product) => <LiveProductCard key={product.id} product={product} />)}</div>}
        </section>

        <section className="section" aria-labelledby="h-services">
          <div className="section-head"><div><p className="eyebrow">Care for every crown</p><h2 id="h-services">Services, made personal</h2></div><Link to="/services">All services</Link></div>
          <div className="service-image-band">
            <img src="/catalogue/care.jpg" alt="Hair care service inspiration" loading="lazy" />
            <div><span className="eyebrow">A little care goes a long way</span><h3>Explore the services currently offered.</h3><p className="muted">View service details and send a booking request. Availability is confirmed by the Raw.hairs team.</p><Link to="/services" className="btn btn-outline">View services</Link></div>
          </div>
        </section>

        <section className="section follow-section" aria-labelledby="h-ig">
          <div><p className="eyebrow">Stay close</p><h2 id="h-ig">Follow Raw.hairs</h2><p className="muted">See new pieces and updates from @raw.hairs.</p></div>
          <a className="btn btn-outline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Visit Instagram</a>
        </section>

        <section className="section" aria-labelledby="h-trust">
          <div className="section-head"><div><p className="eyebrow">Helpful information</p><h2 id="h-trust">Shop with confidence</h2></div></div>
          <div className="trust">{policyLinks.map((policy) => <Link key={policy.id} to={`/help/${policy.id}`}>{policy.label}</Link>)}</div>
        </section>
      </div>
    </>
  );
}
