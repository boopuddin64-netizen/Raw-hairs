import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/_lib/db.js', () => ({ getDb: vi.fn() }));
vi.mock('../api/_lib/auth.js', () => ({
  adminConfig: () => ({ email: 'owner@rawhairs.example' }),
  json: (res, status, body) => { res.status(status).json(body); },
  requireAdmin: () => ({ role: 'admin' }),
}));
vi.mock('../api/_lib/request.js', () => ({
  isSameOriginRequest: () => true,
  readJsonBody: (req) => req.body,
}));

import { getDb } from '../api/_lib/db.js';
import exceptionsHandler from '../api/admin/delivery-exceptions.js';
import retentionHandler from '../api/cron/delivery-evidence-retention.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function queryResult(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    lte: vi.fn(() => query),
    lt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
}

describe('delivery portal hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'a'.repeat(40);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('rejects GET requests to the retention worker so a query string cannot trigger deletion', async () => {
    const res = response();
    await retentionHandler({ method: 'GET', query: { dry_run: 'false' }, headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(getDb).not.toHaveBeenCalled();
  });

  it('defaults retention POST requests to dry-run and reports whether a further batch may exist', async () => {
    const expired = queryResult({ data: [{ id: 'e1', storage_path: 'jobs/a/evidence.jpg' }], error: null });
    const stale = queryResult({ data: [], error: null });
    const db = {
      from: vi.fn((table) => table === 'delivery_evidence' ? expired : stale),
      storage: { from: vi.fn(() => ({ remove: vi.fn() })) },
    };
    getDb.mockReturnValue(db);
    const res = response();
    await retentionHandler({
      method: 'POST', body: {}, query: {},
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.expiredEvidence.wouldDelete).toBe(1);
    expect(res.body.expiredEvidence.hasMore).toBe(false);
    expect(db.storage.from).not.toHaveBeenCalled();
  });

  it('returns a migration-specific 503 when exception audit schema is not applied', async () => {
    const query = queryResult({ data: null, error: { code: '42703' } });
    getDb.mockReturnValue({ from: vi.fn(() => query) });
    const res = response();
    await exceptionsHandler({ method: 'GET', query: { status: 'pending' }, headers: {} }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/schema update is required/i);
  });

  it('returns 409 when another admin has already resolved the exception', async () => {
    const query = queryResult({ data: null, error: null });
    getDb.mockReturnValue({ from: vi.fn(() => query) });
    const res = response();
    await exceptionsHandler({
      method: 'POST',
      headers: { host: 'rawhairs.example', origin: 'https://rawhairs.example', 'x-requested-with': 'rh-admin' },
      body: { op: 'resolve', exceptionId: '123e4567-e89b-12d3-a456-426614174000', resolution: 'Customer contacted.' },
    }, res);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already been actioned/i);
  });
});
