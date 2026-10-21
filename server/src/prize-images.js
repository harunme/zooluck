import { createHash } from 'node:crypto';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/tiff']);

function matchesImageType(type, bytes) {
  const hex = bytes.subarray(0, 12).toString('hex');
  const text = bytes.subarray(0, 4096).toString('utf8');
  switch (type) {
    case 'image/png': return hex.startsWith('89504e470d0a1a0a');
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/gif': return /^(GIF87a|GIF89a)/.test(text);
    case 'image/webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    case 'image/avif': return bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 64));
    case 'image/svg+xml': return /<svg(?:\s|\/?>)/i.test(text);
    case 'image/bmp': return hex.startsWith('424d');
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon': return hex.startsWith('00000100');
    case 'image/tiff': return hex.startsWith('49492a00') || hex.startsWith('4d4d002a');
    default: return false;
  }
}

export function decodePrizeImage(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES / 3) * 4 + 100) return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
  if (!match) return null;
  const type = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const bytes = Buffer.from(match[2], 'base64');
  if (!TYPES.has(type) || !bytes.length || bytes.length > MAX_BYTES || bytes.toString('base64') !== match[2] || !matchesImageType(type, bytes)) return null;
  const hash = createHash('sha256').update(value).digest('hex');
  return { type, bytes, hash };
}

export function validImageInput(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:')) return Boolean(decodePrizeImage(value));
  // Existing emoji/text artwork is supported. Generated URLs are read-only.
  return value.length <= 256 && !/^(?:\/|https?:)/i.test(value);
}

export function prizeProjection(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}id, ${p}name, ${p}quantity, ${p}supplier, ${p}created_at, ${p}updated_at,
    ${p}image_hash, ${p}image_mime,
    CASE WHEN ${p}image_hash IS NULL AND length(${p}image) <= 256 AND ${p}image NOT LIKE 'data:%'
      THEN ${p}image ELSE '' END AS image`;
}

export function prizeImageSource(id, image, hash) {
  if (hash) return `/api/prizes/${id}/image/${hash}`;
  if (!image) return '';
  if (typeof image !== 'string') return '';
  if (!image.startsWith('data:')) return validImageInput(image) ? image : '';
  const decoded = decodePrizeImage(image);
  return decoded ? `/api/prizes/${id}/image/${decoded.hash}` : '';
}

export function serializePrize(prize) {
  const { image_hash, image_mime, ...fields } = prize;
  return { ...fields, image: prizeImageSource(prize.id, prize.image, image_hash) };
}
