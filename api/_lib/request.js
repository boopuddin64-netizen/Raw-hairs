export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

function header(req, name) {
  const value = req?.headers?.[name.toLowerCase()] ?? req?.headers?.[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

export function isSameOriginRequest(req) {
  const origin = header(req, 'origin');
  const host = header(req, 'host').trim().toLowerCase();
  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password || parsed.host.toLowerCase() !== host) return false;
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
  } catch {
    return false;
  }
}

export function trustedRequestOrigin(req) {
  if (!isSameOriginRequest(req)) return null;
  try { return new URL(header(req, 'origin')).origin; } catch { return null; }
}

export function readJsonBody(req, { maxBytes = 64 * 1024 } = {}) {
  const contentLength = header(req, 'content-length').trim();
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0) throw new RequestError(400, 'Invalid request size.');
    if (declared > maxBytes) throw new RequestError(413, 'Request body is too large.');
  }

  const body = req?.body;
  if (body == null || body === '') return {};

  const contentType = header(req, 'content-type');
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new RequestError(415, 'Content-Type must be application/json.');
  }

  let parsed = body;
  if (Buffer.isBuffer(body)) {
    if (body.byteLength > maxBytes) throw new RequestError(413, 'Request body is too large.');
    try { parsed = JSON.parse(body.toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON body.'); }
  } else if (typeof body === 'string') {
    if (byteLength(body) > maxBytes) throw new RequestError(413, 'Request body is too large.');
    try { parsed = JSON.parse(body); } catch { throw new RequestError(400, 'Invalid JSON body.'); }
  } else if (body instanceof ArrayBuffer) {
    if (body.byteLength > maxBytes) throw new RequestError(413, 'Request body is too large.');
    try { parsed = JSON.parse(Buffer.from(body).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON body.'); }
  } else if (ArrayBuffer.isView(body)) {
    if (body.byteLength > maxBytes) throw new RequestError(413, 'Request body is too large.');
    try { parsed = JSON.parse(Buffer.from(body.buffer, body.byteOffset, body.byteLength).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON body.'); }
  } else if (typeof body === 'object') {
    let serialized;
    try { serialized = JSON.stringify(body); } catch { throw new RequestError(400, 'Invalid JSON body.'); }
    if (byteLength(serialized) > maxBytes) throw new RequestError(413, 'Request body is too large.');
  } else {
    throw new RequestError(400, 'Invalid JSON body.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(400, 'A JSON object is required.');
  }
  return parsed;
}

export async function readLimitedRequestBody(request, maxBytes = 64 * 1024) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestError(413, 'Request body is too large.');
  }
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RequestError(413, 'Request body is too large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}
