import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { INSTAGRAM_URL, policyLinks } from './data';
import { useTheme } from './theme/ThemeContext';

const PATHS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></>,
  home: <path d="M4 11l8-7 8 7v9H4z" />,
  shop: <><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>,
  services: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M8.5 7.5L20 18M8.5 16.5L20 6" /></>,
};

export function Icon({ name, size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{PATHS[name]}</svg>;
}

export function BrandLogo({ className = '', title = 'Raw.hairs' }) {
  return <img className={`brand-logo ${className}`} src="/brand/raw-hairs-logo.png" alt={title} />;
}

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
  const submit = (e) => {
    e.preventDefault();
    setSearching(false);
    nav(`/shop?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="header">
      <div className="header-row">
        <button className="icon-btn menu-toggle" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(!menu)}>
          <Icon name={menu ? 'close' : 'menu'} />
        </button>
        <Link to="/" className="brand-link" onClick={() => setMenu(false)} aria-label="Raw.hairs home"><BrandLogo /></Link>
        <nav className="header-links" aria-label="Primary">
          <NavLink to="/shop">Shop</NavLink>
          <NavLink to="/services">Services</NavLink>
          <NavLink to="/help/contact">Contact</NavLink>
        </nav>
        <div className="header-actions">
          <button className="icon-btn" type="button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            <span aria-hidden="true" className="theme-glyph">{theme === 'dark' ? '☼' : '☾'}</span>
          </button>
          <button className="icon-btn" aria-label="Search products" aria-expanded={searching} onClick={() => setSearching(!searching)}><Icon name="search" /></button>
          <Link to="/account" className="icon-btn desktop-account" aria-label="Account"><Icon name="user" /></Link>
          <Link to="/cart" className="icon-btn badge-wrap" aria-label={`Shopping bag, ${cartCount} items`}>
            <Icon name="bag" />{cartCount > 0 && <span className="badge">{cartCount}</span>}
          </Link>
        </div>
      </div>
      {searching && (
        <form className="search-row" onSubmit={submit} role="search">
          <label htmlFor="hdr-q" className="sr-only">Search the collection</label>
          <input id="hdr-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hair, accessories, styles…" />
          <button className="btn btn-primary" type="submit">Search</button>
        </form>
      )}
      {menu && (
        <nav className="drawer" aria-label="Menu" onClick={() => setMenu(false)}>
          <Link to="/shop">Shop hair &amp; accessories</Link>
          <Link to="/services">Services</Link>
          <Link to="/account">Account</Link>
          {policyLinks.map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a>
        </nav>
      )}
    </header>
  );
}

export function BottomNav() {
  const { cartCount } = useStore();
  const items = [
    ['/', 'Home', 'home', true],
    ['/shop', 'Shop', 'shop'],
    ['/services', 'Services', 'services'],
    ['/cart', 'Bag', 'bag'],
    ['/account', 'Account', 'user'],
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(([to, label, icon, end]) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="badge-wrap"><Icon name={icon} />{label === 'Bag' && cartCount > 0 && <span className="badge">{cartCount}</span>}</span>{label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-grid">
        <div className="footer-brand"><Link to="/" aria-label="Raw.hairs home"><BrandLogo /></Link><p className="muted">Raw beauty. Real you.<br />Nigeria · NGN pricing</p></div>
        <ul className="footer-links">
          <li><Link to="/shop">Shop</Link></li><li><Link to="/services">Services</Link></li>
          <li><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a></li>
          {policyLinks.map((p) => <li key={p.id}><Link to={`/help/${p.id}`}>{p.label}</Link></li>)}
        </ul>
      </div>
      <p className="wrap muted small">© RAW HAIRS. All rights reserved.</p>
    </footer>
  );
}

export function Layout() {
  return <><a href="#main" className="skip">Skip to content</a><Header /><main id="main"><Outlet /></main><Footer /><BottomNav /></>;
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const show = (m) => { setMsg(m); window.clearTimeout(show.t); show.t = window.setTimeout(() => setMsg(''), 2600); };
  return [show, msg ? <div className="toast" role="status">{msg}</div> : null];
}
