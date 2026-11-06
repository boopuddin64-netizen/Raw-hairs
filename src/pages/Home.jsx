import { Link } from 'react-router-dom';
import { useStore, naira } from '../store';
import { categories, INSTAGRAM_URL, policyLinks } from '../data';
import { Photo, ProductCard, Chip, useToast } from '../components';

const STATUS = { available: ['ok', 'Available'], paused: ['warn', 'Temporarily unavailable'] };

export default function Home() {
  const { state } = useStore();
  const [toast, toastNode] = useToast();
  const arrivals = state.products.filter((p) => p.isNew).slice(0, 4);
  const best = state.products.filter((p) => p.featured);
  const services = state.services.filter((s) => s.status !== 'hidden');

  return (
    <>
      <section className="hero">
        <div className="hero-note">THE SIGNATURE COLLECTION</div>
        <div className="hero-inner">
          <p className="eyebrow">The collection</p>
          <h1>Your Crown.<br />Your Confidence.</h1>
          <p className="lead">Wigs made to be worn, loved and noticed. Shop online or visit us in person.</p>
          <div className="hero-actions">
            <Link to="/shop" className="btn btn-primary btn-lg">Shop collection</Link>
            <Link to="/services" className="btn btn-outline btn-lg">Explore our services</Link>
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="section" aria-labelledby="h-style">
          <div className="section-head"><h2 id="h-style">Shop by style</h2></div>
          <p className="note">Explore the textures and silhouettes in the demo collection.</p>
          <div className="hscroll cats">
            {categories.map((c) => (
              <Link key={c.id} to={`/shop?cat=${c.id}`} className="cat"><Photo label={c.name} />{c.name}</Link>
            ))}
            <Link to="/shop" className="cat"><Photo label="New in" />New arrivals</Link>
          </div>
        </section>

        <section className="section" aria-labelledby="h-new">
          <div className="section-head"><h2 id="h-new">New arrivals</h2><Link to="/shop">View all</Link></div>
          <div className="grid">{arrivals.map((p) => <ProductCard key={p.id} p={p} onAdded={toast} />)}</div>
        </section>

        <section className="section" aria-labelledby="h-best">
          <div className="section-head"><h2 id="h-best">Best sellers</h2></div>
          <p className="note">Picked by RAW HAIRS in Admin. No sales figures or ratings are shown.</p>
          <div className="hscroll">
            {best.map((p) => (
              <Link key={p.id} to={`/product/${p.id}`} className="featured">
                <Photo label={p.name} />
                <div className="meta"><h3>{p.name}</h3><span className="price">{naira(p.price)}</span></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="h-svc">
          <div className="section-head"><h2 id="h-svc">Wig services</h2><Link to="/services">All services</Link></div>
          <div className="stack services-grid">
            {services.map((s) => {
              const [tone, label] = STATUS[s.status];
              return (
                <div key={s.id} className="row-card" style={{ opacity: s.status === 'paused' ? 0.7 : 1 }}>
                  <Photo label={s.name} />
                  <div className="row-main">
                    <div className="row-top"><h3>{s.name}</h3><Chip tone={tone}>{label}</Chip></div>
                    <span className="muted small">{s.desc}</span>
                    <span className="price" style={{ fontSize: 14 }}>From {naira(s.price)}</span>
                    <Link to="/services" className="link-btn" style={{ justifyContent: 'flex-start' }}>Enquire or book</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section" aria-labelledby="h-rev">
          <div className="section-head"><h2 id="h-rev">Kind words</h2></div>
          <div className="demo-reviews">
            <article><span>★★★★★</span><p>“The finish, movement and overall look are everything.”</p><b>Demo customer story</b><small>Sample testimonial · illustrative only</small></article>
            <article><span>★★★★★</span><p>“A beautiful everyday style with a polished feel.”</p><b>Demo customer story</b><small>Sample testimonial · illustrative only</small></article>
            <article><span>★★★★★</span><p>“The care and attention to detail make the difference.”</p><b>Demo customer story</b><small>Sample testimonial · illustrative only</small></article>
          </div>
        </section>

        <section className="section" aria-labelledby="h-ig">
          <div className="section-head"><h2 id="h-ig">Follow RAW HAIRS</h2></div>
          <p className="note">@raw.hairs on Instagram</p>
          <div className="insta" aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((n) => <div key={n} />)}</div>
          <a className="btn btn-outline" href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">View on Instagram</a>
          <p className="muted small" style={{ marginTop: 10 }}>Illustrative campaign imagery for this client presentation.</p>
        </section>

        <section className="section" aria-labelledby="h-trust">
          <div className="section-head"><h2 id="h-trust" style={{ fontSize: 28 }}>Shop with confidence</h2></div>
          <div className="trust">{policyLinks.map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}</div>
        </section>
      </div>
      {toastNode}
    </>
  );
}
