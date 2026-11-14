import { describe, expect, it } from 'vitest';
import { buildDashboardSnapshot } from '../api/_lib/dashboardSnapshot.js';

describe('admin dashboard snapshot degradation', () => {
  it('returns successful table rows and identifies failed tables separately', () => {
    const orders = [{ id: 'order-1' }];
    const snapshot = buildDashboardSnapshot([
      { key: 'orders', table: 'orders', data: orders, error: null },
      { key: 'payments', table: 'payments', data: null, error: { code: '42P01' } },
    ]);

    expect(snapshot.data.orders).toEqual(orders);
    expect(snapshot.data.payments).toEqual([]);
    expect(snapshot.unavailable).toEqual({ payments: 'payments' });
  });

  it('returns no warnings when every table query succeeds', () => {
    expect(buildDashboardSnapshot([
      { key: 'products', table: 'products', data: [], error: null },
      { key: 'services', table: 'services', data: [{ id: 'service-1' }], error: null },
    ])).toEqual({ data: { products: [], services: [{ id: 'service-1' }] }, unavailable: {} });
  });

  it('does not expose database error contents in the unavailable metadata', () => {
    const result = buildDashboardSnapshot([
      { key: 'returns', table: 'return_requests', data: null, error: { message: 'internal SQL detail', code: '42501' } },
    ]);
    expect(result.unavailable).toEqual({ returns: 'return_requests' });
    expect(JSON.stringify(result)).not.toContain('internal SQL detail');
  });
});
