import { createHash } from 'node:crypto';
import { config } from './config.js';
import { ServiceError } from './errors.js';
import { TokenBucket } from './rate-limit.js';
import { count, observe } from './metrics.js';

export function createMemberVerifier({ timeoutMs = config.memberTimeout, concurrency = config.memberConcurrency, maxBytes = config.memberBytes, fetchImpl = (...args) => fetch(...args), rate = config.memberRate } = {}) {
  const inflight = new Map();
  const limiter = new TokenBucket(rate, rate);
  let closing = false;
  return {
    stats: () => ({ active: inflight.size, closing }),
    async drain() { closing = true; await Promise.allSettled([...inflight.values()]); },
    verify(phone, vipcard) {
      const key = createHash('sha256').update(JSON.stringify([phone, vipcard])).digest('hex');
      if (inflight.has(key)) { count('member.coalesced'); return inflight.get(key); }
      if (closing || inflight.size >= concurrency) return Promise.reject(new ServiceError('MEMBER_BUSY', '会员验证繁忙，请稍后重试'));
      try { limiter.check(key); } catch (error) { return Promise.reject(error); }
      const controller = new AbortController();
      const started = performance.now();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          count('member.timeout');
          reject(new ServiceError('MEMBER_TIMEOUT', '会员验证超时，请稍后重试'));
          controller.abort();
        }, timeoutMs);
      });
      const request = (async () => {
        const response = await fetchImpl('https://dlzoo.fxota.com/ticket-api/scenic/checkCardInfo.json', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify({ cardNo: vipcard.trim(), mobile: phone.trim() }), merchantNo: 'dj121501', merextend: '', method: 'scenic.checkcardinfo', sign: '55502055', signType: 'MD5', version: '1.0' })
        });
        if (!response.ok || !response.body) throw new Error('Invalid member response');
        if (controller.signal.aborted) { await response.body.cancel(); throw new Error('Verification cancelled'); }
        const reader = response.body.getReader();
        const cancelBody = () => { reader.cancel().catch(() => {}); };
        controller.signal.addEventListener('abort', cancelBody, { once: true });
        let size = 0;
        const chunks = [];
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); throw new Error('Member response too large'); }
            chunks.push(value);
          }
        } finally { controller.signal.removeEventListener('abort', cancelBody); reader.releaseLock(); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (data.Code !== '200' || typeof data.Content !== 'string') throw new Error('Invalid member schema');
        const content = JSON.parse(data.Content);
        if (typeof content.subCode !== 'string') throw new Error('Invalid member content');
        return content.subCode === '1';
      })();
      const job = Promise.race([request, timeout]).catch(error => {
        controller.abort();
        if (error instanceof ServiceError) throw error;
        count('member.failed');
        throw new ServiceError('MEMBER_UNAVAILABLE', '暂时无法验证会员，请稍后重试');
      }).finally(() => {
        clearTimeout(timer);
        inflight.delete(key);
        observe('member.duration', performance.now() - started);
      });
      inflight.set(key, job);
      return job;
    }
  };
}

export const membership = createMemberVerifier();
