import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
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

// Temporary mannequin-only product visuals for the demo catalogue.
// Replace with RAW HAIRS-owned/licensed photos before commercial launch.
const DEMO_IMAGES = {
  body: 'https://rawafhair.com/cdn/shop/files/HairWigMannequins10.jpg?v=1763403375',
  straight: 'https://starhairus.com/cdn/shop/files/1_6b1a9c91-bf50-46c6-83c1-66e42795bac9.jpg?v=1733490948',
  deep: 'https://a-static.mlcdn.com.br/420x420/peruca-sem-cola-isee-hair-wear-and-go-para-iniciantes-perucas-sem-cola-de-ondas-profundas-cabelo-humano-pre-arrancado-novo-atualizado-sem-cola-perucas-com-fechamento-de-renda-hd-6x4-cabelo-humano-para-mulheres-negras-com-cabelo-de-bebe-de-24-polegadas/nocnocestadosunidos/buybox-cpb0cc5chzvq/378b146b71314ede56834df8a5b9715f.jpeg',
  bob: 'https://www.loxxofhair.com/cdn/shop/files/4x4613BobWig-HDLace.png?v=1722916990',
  water: 'https://starhairus.com/cdn/shop/files/1_709aae80-036e-4f6a-9b0c-421e290f4f9c.jpg?v=1733494224',
  blonde: 'https://www.loxxofhair.com/cdn/shop/files/4x4613BobWig-HDLace.png?v=1722916990',
  kinky: 'https://www.wigtypes.com/cdn/shop/files/sensationnel-curls-kinks-kinky-curly-18c-240625111410.jpg?v=1719337452',
  burgundy: 'https://i.etsystatic.com/20041168/r/il/e7b724/7942081959/il_fullxfull.7942081959_6m7z.jpg',
  loose: 'https://methinkshair.com/cdn/shop/products/Mstoxic-Jerry-Curly-Human-Hair-Wigs-For-Black-Women-Full-Machine-Wigs-With-Bang-Brazilian-Remy_1800x1800.jpg?v=1591337598',
  pixie: 'https://www.loxxofhair.com/cdn/shop/files/4x4613BobWig-HDLace.png?v=1722916990',
  ombre: 'https://i.etsystatic.com/20041168/r/il/e7b724/7942081959/il_fullxfull.7942081959_6m7z.jpg',
  highlight: 'https://www.loxxofhair.com/cdn/shop/files/4x4613BobWig-HDLace.png?v=1722916990',
};
function demoImageFor(label) {
  const value = String(label).toLowerCase();
  if (value.includes('deep')) return DEMO_IMAGES.deep;
  if (value.includes('water')) return DEMO_IMAGES.water;
  if (value.includes('kinky') || value.includes('curly') || value.includes('afro')) return DEMO_IMAGES.kinky;
  if (value.includes('bob') || value.includes('burgundy') || value.includes('pixie')) return DEMO_IMAGES.bob;
  if (value.includes('blonde') || value.includes('colour') || value.includes('color') || value.includes('highlight')) return DEMO_IMAGES.blonde;
  if (value.includes('straight')) return DEMO_IMAGES.straight;
  if (value.includes('loose')) return DEMO_IMAGES.loose;
  return DEMO_IMAGES.body;
}

export function Icon({ name, size = 24, filled = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{PATHS[name]}</svg>;
}

export function Photo({ label = 'photo', src, className = '', children }) {
  const imageSrc = src || demoImageFor(label);
  const [failed, setFailed] = useState(false);
  return <div className={`photo ${className} photo-demo`}>{failed ? <span className="photo-fallback" role="img" aria-label={`Photo coming soon for ${label}`}>PHOTO COMING SOON</span> : <img src={imageSrc} alt={'Demo visual for ' + label} loading="lazy" decoding="async" onError={() => setFailed(true)} />}{children}</div>;
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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); setSearching(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const submit = (e) => { e.preventDefault(); setSearching(false); nav(`/shop?q=${encodeURIComponent(q)}`); };

  return (
    <header className="header">
      <div className="header-row">
        <button className="icon-btn" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu(!menu)}><Icon name={menu ? 'close' : 'menu'} /></button>
        <Link to="/" className="wordmark" onClick={() => setMenu(false)}>RAW HAIRS</Link>
        <nav className="header-links" aria-label="Primary"><NavLink to="/shop">SHOP</NavLink><NavLink to="/services">SERVICES</NavLink><NavLink to="/help/contact">CONTACT</NavLink></nav>
        <button className="icon-btn" aria-label="Search" onClick={() => setSearching(!searching)}><Icon name="search" /></button>
        <button className="theme-toggle" type="button" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={toggleTheme}><span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span><small>{theme === 'light' ? 'Dark' : 'Light'}</small></button>
        <Link to="/account" className="icon-btn" aria-label="Account"><Icon name="user" /></Link>
        <Link to="/cart" className="icon-btn badge-wrap" aria-label={`Shopping bag, ${cartCount} items`}><Icon name="bag" />{cartCount > 0 && <span className="badge">{cartCount}</span>}</Link>
      </div>
      {searching && <form className="search-row" onSubmit={submit} role="search"><label htmlFor="hdr-q" className="sr-only">Search wigs</label><input id="hdr-q" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by style, length or colour" /><button className="btn btn-primary" type="submit">Search</button></form>}
      {menu && <nav className="drawer" aria-label="Menu" onClick={() => setMenu(false)}><Link to="/shop">Shop all wigs</Link><Link to="/services">Wig services</Link>{policyLinks.map((p) => <Link key={p.id} to={`/help/${p.id}`}>{p.label}</Link>)}<a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a></nav>}
    </header>
  );
}

export function BottomNav() {
  const { cartCount } = useStore();
  const items = [['/', 'HOME', 'home', true], ['/shop', 'SHOP', 'shop'], ['/services', 'SERVICES', 'services'], ['/cart', 'CART', 'bag'], ['/account', 'ACCOUNT', 'user']];
  return <nav className="bottom-nav" aria-label="Main">{items.map(([to, label, icon, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}><span className="badge-wrap"><Icon name={icon} />{label === 'CART' && cartCount > 0 && <span className="badge">{cartCount}</span>}</span>{label}</NavLink>)}</nav>;
}

export function Footer() {
  return <footer className="footer"><div className="wrap footer-grid"><div><span className="wordmark">RAW HAIRS</span><p className="muted">Customer support: [PHONE / WHATSAPP]<br />[EMAIL] · [SHOP ADDRESS] · [HOURS]</p></div><ul className="footer-links"><li><Link to="/shop">Shop</Link></li><li><Link to="/services">Services</Link></li><li><a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener">Instagram</a></li>{policyLinks.map((p) => <li key={p.id}><Link to={`/help/${p.id}`}>{p.label}</Link></li>)}</ul></div><p className="wrap muted small">© RAW HAIRS. All rights reserved.</p></footer>;
}

export function Layout() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname === '/rider') return <Outlet />;
  return <><a href="#main" className="skip" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.focus(); m.scrollIntoView(); } }}>Skip to content</a><Header /><main id="main" tabIndex={-1}><Outlet /></main><Footer /><BottomNav /></>;
}

export function ProductCard({ p, onAdded }) {
  const store = useStore();
  const out = isSoldOut(p);
  const [len, setLen] = useState(p.lengths[Math.min(1, p.lengths.length - 1)]);
  const wished = store.isWished(p.id);
  const add = () => { const r = store.addToCart(p.id, len); onAdded && onAdded(r.ok ? `Added ${len} in to your bag.` : r.message); };
  return <article className="card"><div className="card-media"><Link to={`/product/${p.id}`} aria-label={`View ${p.name}`}><Photo label={p.name} src={p.image && DEMO_IMAGES[p.image]} className="fill">{out && <span className="soldout">SOLD OUT</span>}</Photo></Link><button className="icon-btn wish" aria-label={wished ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`} aria-pressed={wished} onClick={() => { store.toggleWishlist(p.id); onAdded && onAdded(wished ? 'Removed from your wishlist.' : 'Saved to your wishlist.'); }}><Icon name="heart" size={22} filled={wished} /></button></div><div className="card-body"><h3>{p.name}</h3><span className="muted small">{p.spec} · {p.lengths[0]}–{p.lengths[p.lengths.length - 1]} in</span><span className="price">{naira(p.price)}</span><span className="muted small">{stockLabel(p)}</span>{out ? <button className="btn btn-disabled" disabled>SOLD OUT</button> : <><label className="sr-only" htmlFor={`len-${p.id}`}>Length for {p.name}</label><select id={`len-${p.id}`} className="card-len" value={len} onChange={(e) => setLen(Number(e.target.value))}>{p.lengths.map((l) => <option key={l} value={l}>{l} in</option>)}</select><button className="btn btn-primary" onClick={add}>ADD TO BAG</button></>}<Link to={`/product/${p.id}`} className="link-btn">Details</Link></div></article>;
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = (m) => { window.clearTimeout(timer.current); setMsg(m); timer.current = window.setTimeout(() => setMsg(''), 2600); };
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [show, node];
}
