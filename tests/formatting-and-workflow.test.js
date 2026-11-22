// Guards the shared formatting and order-workflow helpers that the storefront
// and the two admin order screens now import from one place.

import { describe, expect, it } from 'vitest';
import { formatNaira, formatNairaDash, formatKobo, formatKoboDash } from '../src/lib/money';
import { ORDER_TRANSITIONS, orderStatusOptions } from '../src/lib/orders';

describe('shared money formatters', () => {
  it('formats customer prices and falls back to a request label', () => {
    expect(formatNaira(98000)).toBe('₦98,000');
    expect(formatNaira(null)).toBe('Price on request');
    expect(formatNaira('')).toBe('Price on request');
    expect(formatNaira('not-a-number')).toBe('Price on request');
  });

  it('uses an em dash for missing back-office values', () => {
    expect(formatNairaDash(98000)).toBe('₦98,000');
    expect(formatNairaDash(null)).toBe('—');
    expect(formatNairaDash(undefined)).toBe('—');
  });

  it('divides kobo exactly once', () => {
    expect(formatKobo(9_800_000)).toBe('₦98,000');
    expect(formatKoboDash(9_800_000)).toBe('₦98,000');
    expect(formatKoboDash(null)).toBe('—');
  });

  it('treats missing kobo as zero for customer totals', () => {
    expect(formatKobo(null)).toBe('₦0');
  });
});

describe('order workflow helpers', () => {
  it('always includes the current status in the select options', () => {
    expect(orderStatusOptions('paid')).toEqual(['paid', 'processing', 'cancelled']);
  });

  it('does not invent transitions for terminal states', () => {
    expect(orderStatusOptions('cancelled')).toEqual(['cancelled']);
  });

  it('keeps the dashboard and orders-console workflow in one map', () => {
    expect(ORDER_TRANSITIONS.processing).toEqual(['dispatched']);
  });
});
