import { describe, expect, it } from 'vitest';
import { isSameOriginRequest, readJsonBody, RequestError } from '../api/_lib/request.js';
import { inspectImageBuffer } from '../api/_lib/imageValidation.js';
import { rateLimitKey } from '../api/_lib/rateLimit.js';
import { safeCataloguePath, validProductImage, validateMutation } from '../api/admin/[action].js';

function png(width = 2, height = 3) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width = 2, height = 3) {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

describe('request security helpers', () => {
  it('accepts a matching HTTPS Origin and Host', () => {
    expect(isSameOriginRequest({ headers: { origin: 'https://shop.example', host: 'shop.example' } })).toBe(true);
  });

  it('rejects missing and cross-origin Origin headers', () => {
    expect(isSameOriginRequest({ headers: { host: 'shop.example' } })).toBe(false);
    expect(isSameOriginRequest({ headers: { origin: 'https://attacker.example', host: 'shop.example' } })).toBe(false);
  });

  it('allows HTTP only for localhost development', () => {
    expect(isSameOriginRequest({ headers: { origin: 'http://localhost:5173', host: 'localhost:5173' } })).toBe(true);
    expect(isSameOriginRequest({ headers: { origin: 'http://shop.example', host: 'shop.example' } })).toBe(false);
  });

  it('parses a bounded JSON object', () => {
    expect(readJsonBody({ headers: { 'content-type': 'application/json' }, body: '{"ok":true}' })).toEqual({ ok: true });
  });

  it('rejects oversized, malformed, and non-JSON requests', () => {
    expect(() => readJsonBody({ headers: { 'content-type': 'application/json', 'content-length': '100' }, body: '{}' }, { maxBytes: 20 }))
      .toThrowError(RequestError);
    expect(() => readJsonBody({ headers: { 'content-type': 'application/json' }, body: '{' })).toThrowError('Invalid JSON body.');
    expect(() => readJsonBody({ headers: { 'content-type': 'text/plain' }, body: 'x' })).toThrowError('Content-Type must be application/json.');
  });
});

describe('image validation', () => {
  it('accepts a PNG only when the declared type matches and dimensions are safe', () => {
    expect(inspectImageBuffer(png(), { expectedMime: 'image/png' })).toMatchObject({ ok: true, width: 2, height: 3 });
    expect(inspectImageBuffer(png(), { expectedMime: 'image/jpeg' }).ok).toBe(false);
  });

  it('rejects malformed content, excessive size, and excessive pixel dimensions', () => {
    expect(inspectImageBuffer(Buffer.from('not an image')).ok).toBe(false);
    expect(inspectImageBuffer(png(), { maxBytes: 10 }).reason).toBe('size');
    expect(inspectImageBuffer(png(10000, 10000)).reason).toBe('dimensions');
  });

  it('parses JPEG dimensions from a Start Of Frame segment', () => {
    expect(inspectImageBuffer(jpeg(), { expectedMime: 'image/jpeg' })).toMatchObject({ ok: true, width: 2, height: 3 });
  });
});

describe('rate-limit key derivation', () => {
  it('is stable, scoped, and does not expose identifiers', () => {
    const a = rateLimitKey('x'.repeat(32), 'admin-login', 'owner@example.com');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimitKey('x'.repeat(32), 'admin-login', 'owner@example.com')).toBe(a);
    expect(rateLimitKey('x'.repeat(32), 'guest-track', 'owner@example.com')).not.toBe(a);
    expect(a).not.toContain('owner@example.com');
  });
});

describe('admin mutation security', () => {
  it('allows owner-managed categories without a hard-coded hair-only enum', () => {
    expect(validateMutation('products', 'insert', {
      name: 'Accessory item', slug: 'accessory-item', category: 'Hair accessories',
      price: 2500, stock: 2, is_active: true, image_path: '/catalogue/hero.jpg',
    })).toBeNull();
  });

  it('rejects sensitive columns and generic writes to protected resources', () => {
    expect(validateMutation('products', 'update', { name: 'Unit', delivery_otp_hash: 'secret' })).toMatch(/cannot be changed/);
    expect(validateMutation('rider_jobs', 'update', { status: 'in_transit' })).toMatch(/not allowed/);
    expect(validateMutation('payments', 'update', { status: 'successful' })).toMatch(/not allowed/);
  });

  it('does not allow payment, delivery, or refund statuses through the order editor', () => {
    expect(validateMutation('orders', 'update', { status: 'paid' })).toMatch(/workflow/);
    expect(validateMutation('orders', 'update', { status: 'delivered' })).toMatch(/workflow/);
    expect(validateMutation('orders', 'update', { status: 'processing' })).toBeNull();
  });

  it('bounds checkout fee settings and business-rule values', () => {
    expect(validateMutation('store_settings', 'upsert', {
      id: 'default', settings: { delivery_fee_default: -1 }, rules: {}, goals: {},
    })).toMatch(/non-negative/);
    expect(validateMutation('store_settings', 'upsert', {
      id: 'default', settings: {}, rules: { max_items_per_order: 500 }, goals: {},
    })).toMatch(/between 1 and 50/);
    expect(validateMutation('store_settings', 'upsert', {
      id: 'default', settings: { delivery_fee_default: 2500 }, rules: { max_items_per_order: 20 }, goals: { monthly_orders: 80 },
    })).toBeNull();
  });

  it('restricts catalogue image paths to safe local files and the approved Pexels host', async () => {
    expect(safeCataloguePath('/catalogue/body.jpg')).toBe(true);
    expect(safeCataloguePath('/catalogue/../../secrets.txt')).toBe(false);
    expect(await validProductImage(null, 'https://images.pexels.com/photos/123/photo.jpeg')).toBe(true);
    expect(await validProductImage(null, 'https://images.pexels.com.evil.test/photos/123/photo.jpeg')).toBe(false);
  });
});
