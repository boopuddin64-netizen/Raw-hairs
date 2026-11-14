import crypto from 'node:crypto';

export function rateLimitKey(secret, scope, identifier) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Rate-limit secret is not configured.');
  const cleanScope = String(scope || '').trim().toLowerCase();
  const cleanIdentifier = String(identifier || '').trim().toLowerCase();
  if (!cleanScope || !cleanIdentifier || cleanScope.length > 80 || cleanIdentifier.length > 512) {
    throw new Error('Invalid rate-limit key input.');
  }
  return crypto.createHmac('sha256', secret).update(`${cleanScope}\0${cleanIdentifier}`).digest('hex');
}

export async function consumeRateLimit(db, keyHash, limit, windowSeconds) {
  if (!db || !/^[0-9a-f]{64}$/.test(String(keyHash))) throw new Error('Rate-limit service is unavailable.');
  const { data, error } = await db.rpc('consume_api_rate_limit', {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data || typeof data.allowed !== 'boolean') throw new Error('Rate-limit service is unavailable.');
  return data;
}

export async function clearRateLimit(db, keyHash) {
  if (!db || !/^[0-9a-f]{64}$/.test(String(keyHash))) throw new Error('Rate-limit service is unavailable.');
  const { error } = await db.rpc('clear_api_rate_limit', { p_key_hash: keyHash });
  if (error) throw new Error('Rate-limit service is unavailable.');
}
