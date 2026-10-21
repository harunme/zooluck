import { withRead, onCommit } from './db.js';
import { decodePrizeImage } from './prize-images.js';
import { config } from './config.js';
import { count } from './metrics.js';
import { ServiceError } from './errors.js';

export class ByteLru {
  constructor(maxBytes, maxEntries) { this.maxBytes = maxBytes; this.maxEntries = maxEntries; this.entries = new Map(); this.bytes = 0; }
  clear() { this.entries.clear(); this.bytes = 0; }
  get(key) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  set(key, value) {
    if (value.bytes.length > this.maxBytes) return;
    if (this.entries.has(key)) { this.bytes -= this.entries.get(key).bytes.length; this.entries.delete(key); }
    this.entries.set(key, value); this.bytes += value.bytes.length;
    while (this.bytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      this.bytes -= this.entries.get(oldest).bytes.length; this.entries.delete(oldest);
    }
  }
}

const entries = new ByteLru(config.imageBytes, config.imageEntries);
const inflight = new Map();
let generation = 0;
export function clearImageCache() { entries.clear(); generation++; }
onCommit(changes => { if (changes.images) clearImageCache(); });
export const imageCacheStats = () => ({ entries: entries.entries.size, bytes: entries.bytes, inflight: inflight.size });

export async function cachedImage(hash) {
  const hit = entries.get(hash);
  if (hit) {
    count('image.hit');
    return hit;
  }
  if (inflight.has(hash)) { count('image.coalesced'); return inflight.get(hash); }
  if (inflight.size >= 128) throw new ServiceError('IMAGE_BUSY', '图片服务繁忙，请稍后重试');
  const version = generation;
  const promise = (async () => {
    count('image.miss');
    const row = await withRead(db => db.get('SELECT image FROM prizes WHERE image_hash = ? LIMIT 1', hash));
    const image = decodePrizeImage(row?.image);
    count('image.decode');
    if (!image || image.hash !== hash) throw new ServiceError('IMAGE_NOT_FOUND', '图片不存在', 404);
    if (version === generation && image.bytes.length <= config.imageBytes) {
      entries.set(hash, image);
    }
    return image;
  })();
  inflight.set(hash, promise);
  try { return await promise; }
  finally { inflight.delete(hash); }
}
