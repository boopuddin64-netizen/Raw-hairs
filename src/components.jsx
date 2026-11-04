import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore, naira, stockLabel, isSoldOut } from './store';
import { INSTAGRAM_URL, policyLinks } from './data';
import { useTheme } from './ThemeContext';

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>,
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  shop: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
  services: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5L20 18M8.5 16.5L20 6" /></>,
  heart: <path d="M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z" />,
  back: <path d="M15 5l-7 7 7 7" />,
};

export function Icon({ name, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// Placeholder for real RAW HAIRS photography. Pass `src` once real images exist.
export function Photo({ label = 'photo', src, className = '', children }) {
  if (src) return <div className={`photo ${className}`}><img src={src} alt={label} loading="lazy" />{children}</div>;
  return <div className={`photo ${className}`} role="img" aria-label={`Placeholder: ${label}`}><span className="photo-tag">{label}</span>{children}</div>;
}

export function Chip({ tone = 'ok', children }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Header() {
  const { cartCount } = useStore();
  const { theme, toggleTheme } = useTheme();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const submit = (e) => { e.preventDefault(); setSearching(false); nav(`/shop?q=${encodeURIComponent(q)}`); };

  return (
    <header className="header">
      <div className="header-row">
        <button className="icon-btn" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button>
        <Link to="/" className="wordmark" onClick={() => setMenu(false)}>RAW HAIRS</Link>
        <nav className="header-links" aria-label="Primary">
          <NavLink to="/shop">SHOP</NavLink>
          <NavLink to="/services">SERVICES</NavLink>
          <NavLink to="/help/contact">CONTACT</NavLink>
        </nav>
        <button className="icon-btn" aria-label="Search" onClick={() => setSearching(!searching)}><Icon name="search" /></button>
        <button className="theme-toggle" type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={toggleTheme}><span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span><small>{theme === 'light' ? 'Dark' : 'Light'}</small></button>
        <Link to="/account" className="icon-btn" aria-label="Account"><Icon name="user" /></Link>
        <Link to="/cart" className="icon-btn badge-wrap" aria-label={`Shopping bag, ${cartCount} items`}>
          <Icon name="bag" />
          {cartCount > 0 && <span className="badge">{cartCount}</span>}
        </Link>
      </div>
      {searching && (
        <form className="search-row" onSubmit={submit} role="search">
          <label htmlFor="hdr-q" className="sr-only">Search wigs</label>
          <input id="hdr-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by style, length or colour" />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
      )}
      {menu && (
        <nav className="drawer" aria-label="Menu" onClick={() => setMenu(false)}>
          <Link to="/shop">Shop all wigs</Link>
          <Link to="/services">Wig services</Link>
          {policyLinks.map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a>
          <Link to="/admin" className="drawer-quiet">Owner admin (demo)</Link>
          <Link to="/rider" className="drawer-quiet">Rider (demo)</Link>
        </nav>
      )}
    </header>
  );
}

export function BottomNav() {
  const { cartCount } = useStore();
  const items = [
    ['/', 'HOME', 'home', true],
    ['/shop', 'SHOP', 'shop'],
    ['/services', 'SERVICES', 'services'],
    ['/cart', 'CART', 'bag'],
    ['/account', 'ACCOUNT', 'user'],
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(([to, label, icon, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="badge-wrap"><Icon name={icon} />{label === 'CART' && cartCount > 0 && <span className="badge">{cartCount}</span>}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div>
          <span className="wordmark">RAW HAIRS</span>
          <p className="muted">Customer support: [PHONE / WHATSAPP]<br />[EMAIL] · [SHOP ADDRESS] · [HOURS]</p>
        </div>
        <ul className="footer-links">
          <li><Link to="/shop">Shop</Link></li>
          <li><Link to="/services">Services</Link></li>
          <li><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a></li>
          {policyLinks.map((p) => <li key={p.id}><Link to={`/help/${p.id}`}>{p.label}</Link></li>)}
        </ul>
      </div>
      <p className="wrap muted small">© RAW HAIRS. All rights reserved.</p>
    </footer>
  );
}

export function Layout() {
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Header />
      <main id="main"><Outlet /></main>
      <Footer />
      <BottomNav />
    </>
  );
}

export function ProductCard({ p, onAdded }) {
  const store = useStore();
  const out = isSoldOut(p);
  const add = () => {
    const r = store.addToCart(p.id, p.lengths[Math.min(1, p.lengths.length - 1)]);
    onAdded && onAdded(r.message);
  };
  return (
    <article className="card">
      <div className="card-media">
        <Link to={`/product/${p.id}`} aria-label={`View ${p.name}`}>
          <Photo label={p.name} className="fill">{out && <span className="soldout">SOLD OUT</span>}</Photo>
        </Link>
        <button className="icon-btn wish" aria-label="Save to wishlist"><Icon name="heart" size={22} /></button>
      </div>
      <div className="card-body">
        <h3>{p.name}</h3>
        <span className="muted small">{p.spec} · {p.lengths[0]}–{p.lengths[p.lengths.length - 1]} in</span>
        <span className="price">{naira(p.price)}</span>
        <span className="muted small">{stockLabel(p)}</span>
        {out
          ? <button className="btn btn-disabled" disabled>SOLD OUT</button>
          : <button className="btn btn-primary" onClick={add}>ADD TO BAG</button>}
        <Link to={`/product/${p.id}`} className="link-btn">Details</Link>
      </div>
    </article>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const show = (m) => { setMsg(m); window.clearTimeout(show.t); show.t = window.setTimeout(() => setMsg(''), 2600); };
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [show, node];
}
