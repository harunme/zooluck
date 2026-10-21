import { ServiceError } from './errors.js';
import { count } from './metrics.js';

export class TokenBucket {
  constructor(rate, burst, { capacity = 10000, now = Date.now } = {}) {
    this.rate = rate;
    this.burst = burst;
    this.capacity = capacity;
    this.ttl = Math.max(120000, Math.ceil(burst * 60000 / rate));
    this.now = now;
    this.entries = new Map();
    this.nextSweep = 0;
  }
  check(key) {
    const now = this.now();
    if (now >= this.nextSweep) {
      for (const [id, entry] of this.entries) if (now - entry.seen >= this.ttl) this.entries.delete(id);
      this.nextSweep = now + 60000;
    }
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.capacity) throw new ServiceError('RATE_LIMIT_CAPACITY', '系统繁忙，请稍后重试');
      entry = { tokens: this.burst, seen: now };
      this.entries.set(key, entry);
    }
    entry.tokens = Math.min(this.burst, entry.tokens + Math.max(0, now - entry.seen) * this.rate / 60000);
    entry.seen = now;
    if (entry.tokens < 1) {
      count('rate.rejected');
      throw new ServiceError('RATE_LIMITED', '操作过于频繁，请稍后重试', 429, Math.ceil((1 - entry.tokens) * 60 / this.rate));
    }
    entry.tokens--;
  }
  clear() { this.entries.clear(); this.nextSweep = 0; }
}
