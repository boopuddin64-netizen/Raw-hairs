// Guards the Vercel function contract for the Paystack webhook.
//
// Vercel only sends a Response back when the module exports named HTTP method
// handlers (POST/GET/...). A default export is treated as a Node (req, res)
// handler, so the returned Response is discarded and the request hangs until
// the platform timeout. That is exactly how the webhook was broken before, so
// these assertions protect the export shape as well as the method behaviour.

import { describe, expect, it } from 'vitest';
import * as webhook from '../api/admin/pay-webhook.js';

const url = 'https://shop.example/api/admin/pay-webhook';

describe('paystack webhook handler contract', () => {
  it('exports named HTTP method handlers and no default export', () => {
    expect(typeof webhook.POST).toBe('function');
    expect(typeof webhook.GET).toBe('function');
    expect(webhook.default).toBeUndefined();
  });

  it('answers GET with 405 instead of leaving the request open', async () => {
    const res = await webhook.GET();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'Method not allowed.' });
  });

  it('rejects an unsigned POST with 401 and a JSON body', async () => {
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"event":"charge.success"}',
    });
    const res = await webhook.POST(request);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature.' });
  });

  it('rejects a body larger than the limit with 413', async () => {
    const request = new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1) },
      body: '{}',
    });
    const res = await webhook.POST(request);
    expect(res.status).toBe(413);
  });
});
