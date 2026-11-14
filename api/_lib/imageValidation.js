const FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
export const MAX_IMAGE_PIXELS = 40_000_000;

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (JPEG_SOF.has(marker)) {
      if (length < 7) return null;
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (kind === 'VP8L' && bytes[20] === 0x2f) {
    const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

export function inspectImageBuffer(input, { expectedMime, maxBytes = 5 * 1024 * 1024 } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!bytes.length || bytes.length > maxBytes) return { ok: false, reason: 'size' };

  let mime = '';
  let dimensions = null;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    mime = 'image/png';
    dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp';
    dimensions = webpDimensions(bytes);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg';
    dimensions = jpegDimensions(bytes);
  }

  if (!mime || !FORMATS[mime] || (expectedMime && mime !== expectedMime)) return { ok: false, reason: 'type' };
  if (!dimensions || !Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)
      || dimensions.width < 1 || dimensions.height < 1
      || dimensions.width > 10000 || dimensions.height > 10000
      || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    return { ok: false, reason: 'dimensions' };
  }

  return { ok: true, mime, extension: FORMATS[mime], ...dimensions, bytes: bytes.length };
}
