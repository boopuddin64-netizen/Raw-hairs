import { getDb } from '../_lib/db.js';

const BUCKET = 'delivery-evidence';
const BATCH_SIZE = 50;
const VERIFIED_TTL_MINUTES = 15;

function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function authorized(req) {
  const secret = process.env.CRON_SECRET || '';
  const header = String(req.headers?.authorization || '');
  return secret.length >= 32 && header === `Bearer ${secret}`;
}

/**
 * Server-only retention worker. Dry-run is the default; actual deletion requires
 * an authenticated POST with dry_run=false. Storage objects are removed
 * before their metadata, so a storage failure leaves a retryable metadata row.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'Method not allowed.' });
  }
  if (!authorized(req)) return reply(res, 401, { error: 'Unauthorized.' });

  // Destructive cleanup is opt-in in the POST body; query strings cannot trigger deletion.
  const requestedDryRun = req.body?.dry_run;
  const dryRun = requestedDryRun !== false;
  const db = getDb();
  if (!db) return reply(res, 503, { error: 'Database not configured.' });

  const result = {
    dryRun,
    batchSize: BATCH_SIZE,
    expiredEvidence: { scanned: 0, wouldDelete: 0, deleted: 0, failed: 0, hasMore: false },
    staleVerifiedUploads: { scanned: 0, wouldDelete: 0, deleted: 0, failed: 0, hasMore: false },
  };

  try {
    const nowIso = new Date().toISOString();
    const { data: expired, error: expiredError } = await db.from('delivery_evidence')
      .select('id,storage_path').lte('expires_at', nowIso)
      .order('expires_at', { ascending: true }).limit(BATCH_SIZE);
    if (expiredError) throw expiredError;
    result.expiredEvidence.scanned = (expired || []).length;
    result.expiredEvidence.hasMore = result.expiredEvidence.scanned === BATCH_SIZE;

    const cutoff = new Date(Date.now() - VERIFIED_TTL_MINUTES * 60 * 1000).toISOString();
    const { data: stale, error: staleError } = await db.from('verified_delivery_evidence')
      .select('path').lt('verified_at', cutoff)
      .order('verified_at', { ascending: true }).limit(BATCH_SIZE);
    if (staleError) throw staleError;
    result.staleVerifiedUploads.scanned = (stale || []).length;
    result.staleVerifiedUploads.hasMore = result.staleVerifiedUploads.scanned === BATCH_SIZE;

    if (dryRun) {
      result.expiredEvidence.wouldDelete = result.expiredEvidence.scanned;
      result.staleVerifiedUploads.wouldDelete = result.staleVerifiedUploads.scanned;
      return reply(res, 200, result);
    }

    for (const row of expired || []) {
      const { error: storageError } = await db.storage.from(BUCKET).remove([row.storage_path]);
      if (storageError) {
        result.expiredEvidence.failed += 1;
        console.error('[delivery-retention] expired object removal failed', { recordId: row.id });
        continue;
      }
      const { error: deleteError } = await db.from('delivery_evidence').delete().eq('id', row.id);
      if (deleteError) {
        result.expiredEvidence.failed += 1;
        console.error('[delivery-retention] expired metadata deletion failed', { recordId: row.id });
        continue;
      }
      result.expiredEvidence.deleted += 1;
    }

    for (const row of stale || []) {
      const { error: storageError } = await db.storage.from(BUCKET).remove([row.path]);
      if (storageError) {
        result.staleVerifiedUploads.failed += 1;
        console.error('[delivery-retention] stale upload removal failed');
        continue;
      }
      const { error: deleteError } = await db.from('verified_delivery_evidence').delete().eq('path', row.path);
      if (deleteError) {
        result.staleVerifiedUploads.failed += 1;
        console.error('[delivery-retention] stale upload metadata deletion failed');
        continue;
      }
      result.staleVerifiedUploads.deleted += 1;
    }

    result.expiredEvidence.hasMore = result.expiredEvidence.scanned === BATCH_SIZE;
    result.staleVerifiedUploads.hasMore = result.staleVerifiedUploads.scanned === BATCH_SIZE;
    console.info('[delivery-retention] cleanup complete', result);
    return reply(res, 200, result);
  } catch (error) {
    console.error('[delivery-retention] cleanup failed', { message: error?.message || 'unknown' });
    return reply(res, 500, { error: 'Delivery evidence cleanup failed.', result });
  }
}
