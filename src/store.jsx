import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { seed } from './data';

// DEMO STORE: keeps everything in this browser's localStorage so the screens can be tried.
// It is NOT a backend. There is no real stock control, payment or sign-in yet.
const KEY = 'rawhairs-demo-v1';
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(seed), ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return structuredClone(seed);
}

export const naira = (n) => (n == null || n === '' ? '₦ [PRICE]' : '₦' + Number(n).toLocaleString('en-NG'));

export function stockLabel(p) {
  if (!p.available) return 'Unavailable';
  if (p.stock <= 0) return 'Sold out';
  if (p.stock <= 2) return 'Low stock';
  return 'In stock';
}
export const isSoldOut = (p) => !p.available || p.stock <= 0;

export function StoreProvider({ children }) {
  const [s, setS] = useState(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }, [s]);

  const update = useCallback((fn) => setS((cur) => fn(structuredClone(cur))), []);

  const api = useMemo(() => {
    const product = (id) => s.products.find((p) => p.id === id);
    const inCart = (id) => s.cart.filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);
    return {
      state: s,
      product,
      cartCount: s.cart.reduce((a, c) => a + c.qty, 0),
      isWished: (id) => (s.wishlist || []).includes(id),
      toggleWishlist(id) {
        update((d) => {
          d.wishlist = d.wishlist || [];
          const i = d.wishlist.indexOf(id);
          if (i >= 0) d.wishlist.splice(i, 1); else d.wishlist.push(id);
          return d;
        });
      },
      addToCart(id, length, qty = 1) {
        const p = product(id);
        if (!p || isSoldOut(p)) return { ok: false, message: 'This wig is sold out.' };
        if (inCart(id) + qty > p.stock) return { ok: false, message: 'You already have the most we can offer of this wig in your bag.' };
        update((d) => {
          const line = d.cart.find((c) => c.id === id && c.length === length);
          if (line) line.qty += qty; else d.cart.push({ id, length, qty });
          return d;
        });
        return { ok: true, message: 'Added to your bag.' };
      },
      setQty(id, length, qty) {
        update((d) => {
          const p = d.products.find((x) => x.id === id);
          const others = d.cart.filter((c) => c.id === id && c.length !== length).reduce((a, c) => a + c.qty, 0);
          const max = Math.max(0, (p ? p.stock : 0) - others);
          const line = d.cart.find((c) => c.id === id && c.length === length);
          if (line) line.qty = Math.max(1, Math.min(qty, max || 1));
          return d;
        });
      },
      removeLine(id, length) {
        update((d) => { d.cart = d.cart.filter((c) => !(c.id === id && c.length === length)); return d; });
      },
      patchProduct(id, patch) {
        update((d) => { Object.assign(d.products.find((p) => p.id === id), patch); return d; });
      },
      setServiceStatus(id, status) {
        update((d) => { d.services.find((x) => x.id === id).status = status; return d; });
      },
      patchService(id, patch) {
        update((d) => { Object.assign(d.services.find((x) => x.id === id), patch); return d; });
      },
      addBooking(b) {
        update((d) => { d.bookings.unshift({ ...b, id: 'B' + Date.now().toString().slice(-5) }); return d; });
      },
      addInternationalRequest(r) {
        update((d) => {
          d.requests.unshift({ ...r, id: 'R' + Date.now().toString().slice(-5), lines: structuredClone(d.cart) });
          return d;
        });
      },
      advanceJob(id) {
        update((d) => { const j = d.jobs.find((x) => x.id === id); if (j && j.step < 3) j.step += 1; return d; });
      },
      setRiderStatus(id, status) {
        update((d) => { d.riders.find((r) => r.id === id).status = status; return d; });
      },
      inviteRider(name) {
        update((d) => { d.riders.push({ id: 'r' + Date.now(), name, status: 'invited' }); return d; });
      },
      reset() { setS(structuredClone(seed)); },
    };
  }, [s, update]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
