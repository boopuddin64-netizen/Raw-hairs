// Unit tests for the money/format layer shared by the storefront, admin
// console, and checkout. Kept dependency-free: vitest can import these
// pure helpers without Supabase credentials or a browser environment.

import { describe, expect, it } from 'vitest';
import { naira, stockLabel, isSoldOut } from '../src/store';
import { formatKobo, secondsRemaining, checkoutErrorMessage } from '../src/lib/checkout';

// naira() and store helpers come from store.jsx which has JSX in the file
// (StoreProvider). Vitest handles .jsx with esbuild by default - no plugin
// config needed for a plain import.

describe('naira formatting', () => {
  it('formats whole naira amounts', () => {
    expect(naira(78000)).toBe('₦78,000');
  });

  it('returns price-on-request for missing values', () => {
    expect(naira(null)).toBe('Price on request');
    expect(naira('')).toBe('Price on request');
  });

  it('formats large amounts with grouping', () => {
    expect(naira(1250000)).toBe('₦1,250,000');
  });
});

describe('stock helpers', () => {
  it('labels sold-out products', () => {
    expect(isSoldOut({ stock: 0 })).toBe(true);
    expect(isSoldOut({ stock: 3 })).toBe(false);
    expect(stockLabel({ stock: 0 })).toBe('Sold out');
  });

  it('labels low stock', () => {
    expect(stockLabel({ stock: 2 })).toBe('Only 2 left');
  });

  it('labels in-stock products', () =>  {
    expect(stockLabel({ stock: 5 })).toBe('In stock');
  });
  it('handles missing products', () => {
    expect(stockLabel(null)).toBe('Unavailable');
  });
});

// checkout.js imports supabase.js, which reads import.meta.env at module
// scope. Vitest defines import.meta.env as an empty object, so the guarded
// client creation is skipped safely and these tests run without any env.

describe('kobo helpers (checkout client)', () => {
  it('formats kobo as naira', () => {
    expect(formatKobo(7800000)).toBe('₦78,000');
    expect(formatKobo(0)).toBe('₦0');
  });

  it('never shows decimals for whole-kobo values', () => {
    expect(formatKobo(123456)).toBe('₦1,235'); // integer naira display of 1234.56
  });
  it('treats invalid input as zero', () => {
    expect(formatKobo(undefined)).toBe('₦0');
    expect(formatKobo(null)).toBe('₦0');
  });
  it('counts down to an expiry', () => {
    const future = new Date(Date.now() + 90_000).toISOString();
    const left = secondsRemaining(future);
    expect(left).toBeGreaterThan(80);
    expect(left).toBeLessThanOrEqual(90);
  });
  it('clamps expired reservations to zero', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(secondsRemaining(past)).toBe(0);
  });
});

describe('checkout error mapping', () => {
  it('maps known RPC error codes to human messages', () => {
    expect(checkoutErrorMessage('insufficient_stock')).toContain('stock');
    expect(checkoutErrorMessage('reservation_expired')).toContain('reservation');
  });

  it('falls back to a generic message for unknown codes', () => {
    expect(checkoutErrorMessage('something_new')).toBe('Something went wrong. Please try again.');
  });
});
