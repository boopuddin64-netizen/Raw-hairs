import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';

// Cart is browser-local until checkout creates a real order in Supabase.
// Product details always come from the live catalogue (useCatalog), never from seed data.
const KEY = 'rawhairs-cart-v2';
const Ctx = createContext(null);

function loadCart() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) { /* ignore */ }
  return [];
}

export const naira = (n) => (n == null || n === '' ? 'Price on request' : '₦' + Number(n).toLocaleString('en-NG'));

export function stockLabel(p) {
  if (!p) return 'Unavailable';
  if (p.stock <= 0) return 'Sold out';
  if (p.stock <= 2) return `Only ${p.stock} left`;
  return 'In stock';
}

export const isSoldOut = (p) => !p || p.stock <= 0;

export function StoreProvider({ children }) {
  const [cart, setCart] = useState(loadCart);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
  }, [cart]);

  const api = useMemo(() => {
    const inCart = (id) => cart.filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);

    return {
      cart,
      cartCount: cart.reduce((a, c) => a + c.qty, 0),

      addToCart(product, length = null, qty = 1) {
        if (!product || isSoldOut(product)) {
          return { ok: false, message: 'This wig is sold out.' };
        }
        const id = product.id;
        const current = inCart(id);
        if (current + qty > product.stock) {
          return { ok: false, message: `Only ${product.stock} available.` };
        }
        setCart((prev) => {
          const line = prev.find((c) => c.id === id && c.length === length);
          if (line) {
            return prev.map((c) =>
              c.id === id && c.length === length ? { ...c, qty: c.qty + qty } : c
            );
          }
          return [...prev, {
            id,
            length,
            qty,
            name: product.name,
            price: product.price,
            category: product.category,
            image_url: product.image_url || '',
            stock: product.stock,
          }];
        });
        return { ok: true, message: 'Added to your bag.' };
      },

      setQty(id, length, qty) {
        setCart((prev) => {
          const line = prev.find((c) => c.id === id && c.length === length);
          if (!line) return prev;
          const max = Math.max(1, line.stock || 1);
          const nextQty = Math.max(1, Math.min(Number(qty) || 1, max));
          return prev.map((c) =>
            c.id === id && c.length === length ? { ...c, qty: nextQty } : c
          );
        });
      },

      removeLine(id, length) {
        setCart((prev) => prev.filter((c) => !(c.id === id && c.length === length)));
      },

      clearCart() {
        setCart([]);
      },

      // Refresh cached product fields (price/stock/image) when catalogue reloads
      syncProductSnapshots(products) {
        if (!Array.isArray(products) || products.length === 0) return;
        const byId = Object.fromEntries(products.map((p) => [p.id, p]));
        setCart((prev) => prev.map((line) => {
          const live = byId[line.id];
          if (!live) return line;
          return {
            ...line,
            name: live.name,
            price: live.price,
            category: live.category,
            image_url: live.image_url || line.image_url,
            stock: live.stock,
            qty: Math.min(line.qty, Math.max(1, live.stock || 1)),
          };
        }).filter((line) => {
          const live = byId[line.id];
          // Drop lines for unpublished / missing products
          return live && live.stock > 0;
        }));
      },
    };
  }, [cart]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
