import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourcePool } from '../src/resource-pool.js';
import { TokenBucket } from '../src/rate-limit.js';
import { createMemberVerifier } from '../src/membership.js';
import { startPasswords, hashPassword, comparePassword, closePasswords, passwordStats, PasswordWorker } from '../src/passwords.js';
import { ByteLru } from '../src/image-cache.js';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const memberResponse = () => new Response(JSON.stringify({ Code: '200', Content: JSON.stringify({ subCode: '1' }) }));

test('FIFO pool bounds waiting work and does not release an executing task on a queue deadline', async () => {
  const pool = new ResourcePool([{}], { limit: 1, waitMs: 15, name: 'test.pool' });
  let finish;
  const running = pool.run(() => new Promise(resolve => { finish = resolve; }));
  const queued = pool.run(() => assert.fail('expired work must never execute'));
  const expired = assert.rejects(queued, { code: 'QUEUE_TIMEOUT' });
  await assert.rejects(pool.run(() => {}), { code: 'QUEUE_FULL' });
  await expired;
  assert.equal(pool.stats().active, 1);
  finish('completed');
  assert.equal(await running, 'completed');
  assert.equal(await pool.run(() => 'next'), 'next');
  await pool.drain();
  await assert.rejects(pool.run(() => {}), { code: 'SERVICE_STOPPING' });
});

test('pool drains queued jobs in order and recovers from a failing task', async () => {
  const pool = new ResourcePool([{}], { limit: 3, waitMs: 100, name: 'test.drain' });
  const order = [];
  const first = pool.run(async () => { await wait(5); order.push(1); throw new Error('test failure'); });
  const failed = assert.rejects(first, /test failure/);
  const second = pool.run(() => { order.push(2); return 2; });
  const third = pool.run(() => { order.push(3); return 3; });
  await pool.drain();
  await failed;
  assert.deepEqual(await Promise.all([second, third]), [2, 3]);
  assert.deepEqual(order, [1,2,3]);
});

test('token buckets enforce burst, refill, expiry and bounded state', () => {
  let now = 0;
  const bucket = new TokenBucket(60, 2, { capacity: 2, now: () => now });
  bucket.check('a'); bucket.check('a');
  assert.throws(() => bucket.check('a'), { status: 429 });
  now = 1000; bucket.check('a'); bucket.check('b');
  assert.throws(() => bucket.check('c'), { code: 'RATE_LIMIT_CAPACITY' });
  now = 122000; bucket.check('c');
  assert.equal(bucket.entries.size, 1);
});

test('artwork LRU is bounded by bytes and entry count and refreshes recency', () => {
  const cache = new ByteLru(10, 2);
  cache.set('a', { bytes: Buffer.alloc(4) }); cache.set('b', { bytes: Buffer.alloc(4) });
  assert.ok(cache.get('a'));
  cache.set('c', { bytes: Buffer.alloc(5) });
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.bytes, 9);
  cache.set('c', { bytes: Buffer.alloc(2) });
  assert.equal(cache.bytes, 6);
  cache.set('too-big', { bytes: Buffer.alloc(11) });
  assert.equal(cache.entries.size, 2);
  cache.clear(); assert.equal(cache.bytes, 0);
});

test('membership coalesces inflight verification and does not cache completed identities', async () => {
  let calls = 0;
  const verifier = createMemberVerifier({ fetchImpl: async () => { calls++; await wait(5); return memberResponse(); } });
  assert.deepEqual(await Promise.all(Array.from({ length: 50 }, () => verifier.verify('phone', 'card'))), Array(50).fill(true));
  assert.equal(calls, 1);
  await verifier.verify('phone', 'card');
  assert.equal(calls, 2);
  assert.equal(verifier.stats().active, 0);
});

test('membership has a total deadline even if the fetch implementation never settles', async () => {
  let signal;
  const verifier = createMemberVerifier({ timeoutMs: 20, fetchImpl: (_, options) => { signal = options.signal; return new Promise(() => {}); } });
  await assert.rejects(verifier.verify('phone', 'card'), { code: 'MEMBER_TIMEOUT' });
  assert.equal(signal.aborted, true);
  assert.equal(verifier.stats().active, 0);
});

test('membership deadline cancels a stalled response body', async () => {
  let cancelled = false;
  const verifier = createMemberVerifier({ timeoutMs: 20, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
    cancel() { cancelled = true; }
  })) });
  await assert.rejects(verifier.verify('phone', 'card'), { code: 'MEMBER_TIMEOUT' });
  assert.equal(cancelled, true);
});

test('membership bounds concurrent requests, checks response size/schema and releases failed slots', async () => {
  let complete;
  const verifier = createMemberVerifier({ concurrency: 1, fetchImpl: () => new Promise(resolve => { complete = () => resolve(memberResponse()); }) });
  const first = verifier.verify('a', 'a');
  await assert.rejects(verifier.verify('b', 'b'), { code: 'MEMBER_BUSY' });
  complete(); await first;
  for (const response of [new Response('bad json'), new Response('a'.repeat(100), { status: 200 }), new Response('{}', { status: 500 }), new Response(JSON.stringify({ Code: '200', Content: '{}' }))]) {
    const invalid = createMemberVerifier({ maxBytes: 80, fetchImpl: async () => response });
    await assert.rejects(invalid.verify('a', 'b'), { code: 'MEMBER_UNAVAILABLE' });
    assert.equal(invalid.stats().active, 0);
  }
  const limited = createMemberVerifier({ rate: 1, fetchImpl: async () => memberResponse() });
  await limited.verify('a', 'a');
  await assert.rejects(limited.verify('a', 'a'), { status: 429 });
  await limited.drain();
  await assert.rejects(limited.verify('b', 'b'), { code: 'MEMBER_BUSY' });
});

test('password workers warm up, handle parallel work and leave the main loop responsive', async () => {
  try {
    await Promise.all([startPasswords(), startPasswords(), startPasswords()]);
    assert.equal(passwordStats().ready, true);
    let timerRan = false;
    const task = Promise.all(Array.from({ length: 8 }, () => hashPassword('temporary-test-password')));
    await new Promise(resolve => setTimeout(() => { timerRan = true; resolve(); }, 10));
    assert.equal(timerRan, true);
    const hashes = await task;
    assert.equal(await comparePassword('temporary-test-password', hashes[0]), true);
    assert.equal(await comparePassword('wrong', hashes[0]), false);
    await assert.rejects(comparePassword('bad', null), { code: 'PASSWORD_FAILED' });
    assert.equal(await comparePassword('temporary-test-password', hashes[1]), true);
  } finally { await closePasswords(); }
  assert.equal(passwordStats().ready, false);
});

test('a terminated password worker is replaced before serving another job', async () => {
  const worker = new PasswordWorker();
  try {
    await worker.start();
    const hash = await worker.run({ operation: 'hash', password: 'recovery-test' });
    await worker.worker.terminate();
    assert.equal(worker.failed, true);
    assert.equal(await worker.run({ operation: 'compare', password: 'recovery-test', hash }), true);
    assert.equal(worker.failed, false);
  } finally { await worker.close(); }
});
