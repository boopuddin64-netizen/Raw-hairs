import { Link } from 'react-router-dom';
import { categories, INSTAGRAM_URL, policyLinks } from '../data';
import { LiveProductCard, useCatalog } from '../catalog';

export default function Home() {
  const { products, loading, error } = useCatalog();
  const arrivals = products.slice(0, 4);

  return (
    <>
      <section className="hero">
        <div className="hero-note">RAW HAIRS COLLECTION</div>
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
            {categories.map((c) => <Link key={c.id} to={`/shop?cat=${c.id}`} className="cat"><span className="photo">{c.name}</span>{c.name}</Link>)}
            <Link to="/shop" className="cat"><span className="photo">New in</span>New arrivals</Link>
          </div>
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
          <div className="placeholder-box"><span className="big">Care, revamps and customization.</span><span className="muted small">Explore our services or contact RAW HAIRS for availability and pricing.</span><Link to="/services" className="btn btn-outline">Explore services</Link></div>
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
      </div>
    </>
  );
}
