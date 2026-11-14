import { describe, expect, it } from 'vitest';
import { getStaffRole, isAdmin, isDriver } from '../src/lib/supabase.js';

describe('staff portal role separation', () => {
  it('allows a trusted driver role into the driver portal', () => {
    const driver = { id: 'driver-1', app_metadata: { role: 'driver' } };
    expect(getStaffRole(driver)).toBe('driver');
    expect(isDriver(driver)).toBe(true);
    expect(isAdmin(driver)).toBe(false);
  });

  it('does not allow an admin into the driver portal', () => {
    const admin = { id: 'admin-1', app_metadata: { role: 'admin' } };
    expect(getStaffRole(admin)).toBe('admin');
    expect(isAdmin(admin)).toBe(true);
    expect(isDriver(admin)).toBe(false);
  });

  it('does not grant driver access to a mixed admin/driver role account', () => {
    const mixed = { id: 'mixed-1', app_metadata: { roles: ['admin', 'driver'] } };
    expect(getStaffRole(mixed)).toBe('admin');
    expect(isDriver(mixed)).toBe(false);
  });

  it('does not trust user-editable metadata for driver access', () => {
    const untrusted = { id: 'user-1', email: 'unlisted@example.invalid', user_metadata: { role: 'driver' } };
    expect(getStaffRole(untrusted)).toBe(null);
    expect(isDriver(untrusted)).toBe(false);
  });
});
