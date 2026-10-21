import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import app, { resetRequestLimits, setDraining } from '../src/app.js';
import { initDB, closeDB, withRead, withWrite, refreshImageMetadata, invalidateData, databaseStats } from '../src/db.js';
import { hashPassword, startPasswords, closePasswords } from '../src/passwords.js';
import { imageCacheStats } from '../src/image-cache.js';
import { snapshot } from '../src/metrics.js';
import { beijingYearBounds } from '../src/routes/lottery.js';
import { TokenBucket } from '../src/rate-limit.js';
import { ServiceError } from '../src/errors.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+1sAAAAASUVORK5CYII=';
const nativeFetch = globalThis.fetch;
const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET || 'zooluck-secret-key-2026');
let db, server, directory, base;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const memberResponse = () => new Response(JSON.stringify({ Code: '200', Content: JSON.stringify({ subCode: '1' }) }));
async function api(url, body, { method = body === undefined ? 'GET' : 'POST', auth = true, headers = {} } = {}) {
  return nativeFetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'zooluck-concurrency-'));
  db = await initDB(path.join(directory, 'test.db'));
  await startPasswords();
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  resetRequestLimits(); setDraining(false);
  await db.exec("DROP TRIGGER IF EXISTS reject_record; DELETE FROM records; DELETE FROM prizes; UPDATE settings SET setting_value = 'test-redeem' WHERE setting_key = 'redeem_password';");
  await db.run("INSERT INTO prizes(id,name,image,quantity,supplier) VALUES(1,'test',?,200,'zoo')", png);
  await refreshImageMetadata();
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await closePasswords(); await closeDB();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('8, 16 and 50 HTTP draws succeed with default threadpool and 50ms member validation', async t => {
  t.mock.method(globalThis, 'fetch', async () => { await delay(50); return memberResponse(); });
  let total = 0;
  for (const size of [8,16,50]) {
    resetRequestLimits();
    const started = performance.now();
    const timings = [];
    const results = await Promise.all(Array.from({ length: size }, async (_, index) => {
      const response = await api('/api/lottery/draw', { phone: `wave-${size}-${index}`, vipcard: `card-${size}-${index}` });
      const body = await response.json();
      timings.push(performance.now() - started);
      assert.equal(response.status, 200);
      assert.equal(body.status, 1);
      return body;
    }));
    total += size;
    assert.equal(new Set(results.map(row => row.record_id)).size, size);
    timings.sort((a,b) => a-b);
    const p95 = timings[Math.ceil(size * 0.95) - 1];
    assert.ok(p95 < 2000, `P95 ${p95}ms exceeds target`);
    t.diagnostic(`${size} concurrent HTTP draws, member latency 50ms: P95 ${p95.toFixed(1)}ms`);
  }
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM records')).n, total);
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 200 - total);
  assert.equal((await db.get('PRAGMA journal_mode')).journal_mode, 'wal');
  assert.equal(databaseStats().writes.active, 0);
});

test('50 duplicate draws share one verification and reserve exactly one prize', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; await delay(50); return memberResponse(); });
  const results = await Promise.all(Array.from({ length: 50 }, async () => (await api('/api/lottery/draw', { phone: 'duplicate-http', vipcard: 'duplicate-http' })).json()));
  assert.equal(calls, 1);
  assert.equal(results.filter(row => row.status === 1).length, 1);
  assert.equal(results.filter(row => row.status === 3).length, 49);
  assert.equal(new Set(results.map(row => row.record_id)).size, 1);
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 199);
});

test('last stock remains safe while 50 users draw alongside record reads', async t => {
  await db.run('UPDATE prizes SET quantity = 1');
  t.mock.method(globalThis, 'fetch', async () => { await delay(5); return memberResponse(); });
  const draws = Array.from({ length: 50 }, async (_, index) => (await api('/api/lottery/draw', { phone: `last-${index}`, vipcard: `last-${index}` })).json());
  const reads = Array.from({ length: 20 }, () => api('/api/records'));
  const results = await Promise.all(draws);
  for (const response of await Promise.all(reads)) { assert.equal(response.status, 200); await response.json(); }
  assert.equal(results.filter(row => row.status === 1).length, 1);
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM records')).n, 1);
});

test('bad external responses never reserve stock', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('invalid json'));
  const response = await api('/api/lottery/draw', { phone: 'bad-provider', vipcard: 'bad-provider' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MEMBER_UNAVAILABLE');
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 200);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM records')).n, 0);
});

test('the production five-second membership deadline returns retryable failure without stock changes', async t => {
  let signal;
  t.mock.method(globalThis, 'fetch', (_, options) => { signal = options.signal; return new Promise(() => {}); });
  const started = performance.now();
  const response = await api('/api/lottery/draw', { phone: 'timeout-http', vipcard: 'timeout-http' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MEMBER_TIMEOUT');
  assert.equal(signal.aborted, true);
  assert.ok(performance.now() - started < 6000);
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 200);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM records')).n, 0);
});

test('overloaded game responses preserve their error shape and Retry-After', async t => {
  t.mock.method(TokenBucket.prototype, 'check', () => { throw new ServiceError('RATE_LIMITED', '操作过于频繁，请稍后重试', 429, 3); });
  for (const endpoint of ['draw', 'exchange']) {
    const response = await api('/api/lottery/' + endpoint, {});
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '3');
    const body = await response.json();
    assert.equal(body.code, 'RATE_LIMITED');
    assert.equal(endpoint === 'draw' ? body.status : body.error, endpoint === 'draw' ? 2 : 1);
  }
});

test('write queue has a hard capacity and read leases reject writes', async () => {
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const running = withWrite(() => new Promise(resolve => { release = resolve; started(); }));
  await ready;
  const waiting = Array.from({ length: 128 }, () => withWrite(connection => connection.get('SELECT 1')));
  await assert.rejects(withWrite(() => {}), { code: 'QUEUE_FULL' });
  assert.equal(databaseStats().writes.queued, 128);
  release();
  await Promise.all([running, ...waiting]);
  await assert.rejects(withRead(connection => connection.run('UPDATE prizes SET quantity = 999')), { code: 'SQLITE_READONLY' });
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 200);
});

test('concurrent exchanges mark a prize once and use Beijing year boundaries', async () => {
  const [start] = beijingYearBounds();
  await db.run("INSERT INTO records(prize_id,phone,vipcard,quantity,record_type,status,created_at) VALUES(1,'redeem-phone','redeem-card',1,'draw',0,?)", start);
  invalidateData({ records: true });
  const results = await Promise.all(Array.from({ length: 16 }, async () => (await api('/api/lottery/exchange', { phone: 'redeem-phone', vipcard: 'redeem-card', parssword: 'test-redeem' })).json()));
  assert.equal(results.filter(row => row.error === 0).length, 1);
  assert.equal(results.filter(row => row.msg === '该奖品已被兑奖').length, 15);
  assert.equal((await db.get('SELECT quantity FROM prizes')).quantity, 200);
  assert.deepEqual(beijingYearBounds(new Date('2025-12-31T16:00:00Z')), ['2025-12-31 16:00:00','2026-12-31 16:00:00']);
});

test('ordinary bodies are small, uploads authenticate before parsing, and game errors keep their shape', async () => {
  const large = 'a'.repeat(17000);
  const ordinary = await api('/api/lottery/draw', { phone: large, vipcard: 'x' });
  assert.equal(ordinary.status, 413);
  const body = await ordinary.json();
  assert.equal(body.status, 2); assert.equal(body.code, 'BODY_TOO_LARGE');
  const anonymousUpload = await api('/api/prizes', { image: large }, { auth: false });
  assert.equal(anonymousUpload.status, 401);
  await anonymousUpload.json();
  const anonymousAdmin = await api('/api/auth/create', { username: 'test', password: 'test' }, { auth: false });
  assert.equal(anonymousAdmin.status, 401); await anonymousAdmin.json();
  const image = 'data:image/png;base64,' + Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.alloc(20000)]).toString('base64');
  const upload = await api('/api/prizes', { name: 'upload', supplier: 'zoo', quantity: 1, image });
  assert.equal(upload.status, 201);
  assert.match((await upload.json()).image, /^\/api\/prizes\//);
});

test('trusted proxy rate keys use the actual client rather than a spoofed forwarded prefix', async () => {
  for (let index = 0; index < 10; index++) {
    const response = await api('/api/auth/login', { username: 'missing', password: 'wrong' }, { headers: { 'X-Forwarded-For': `fake-${index}, 198.51.100.10` } });
    assert.equal(response.status, 401); await response.json();
  }
  const limited = await api('/api/auth/login', { username: 'missing', password: 'wrong' }, { headers: { 'X-Forwarded-For': 'different-fake, 198.51.100.10' } });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal((await limited.json()).code, 'RATE_LIMITED');
});

test('authenticated administrator creation works through password workers', async () => {
  const created = await api('/api/auth/create', { username: 'worker-admin', password: 'worker-password' });
  assert.equal(created.status, 200); await created.json();
  const loggedIn = await api('/api/auth/login', { username: 'worker-admin', password: 'worker-password' });
  assert.equal(loggedIn.status, 200);
  assert.equal((await loggedIn.json()).success, true);
});

test('readiness detects queued database reads and draining while liveness stays cheap', async () => {
  assert.equal((await api('/api/ready')).status, 200);
  let releaseA, releaseB;
  const a = withRead(() => new Promise(resolve => { releaseA = resolve; }));
  const b = withRead(() => new Promise(resolve => { releaseB = resolve; }));
  try { assert.equal((await api('/api/ready')).status, 503); }
  finally { releaseA(); releaseB(); await Promise.all([a,b]); }
  assert.equal((await api('/api/ready')).status, 200);
  setDraining(true);
  try {
    assert.equal((await api('/api/ready')).status, 503);
    assert.equal((await api('/api/health')).status, 200);
    const draw = await api('/api/lottery/draw', { phone: 'unused', vipcard: 'unused' });
    assert.equal(draw.status, 503); assert.equal((await draw.json()).status, 2);
  } finally { setDraining(false); }
});

test('password calculations do not hold the write queue or delay liveness', async () => {
  const jobs = Promise.all(Array.from({ length: 8 }, () => hashPassword('local-load')));
  const started = performance.now();
  const response = await api('/api/health');
  assert.equal(response.status, 200); await response.json();
  assert.ok(performance.now() - started < 300);
  assert.equal(databaseStats().writes.active, 0);
  await jobs;
});

test('304 never decodes artwork; concurrent cache misses decode once and metadata edits preserve cache', async () => {
  const url = (await (await api('/api/prizes')).json())[0].image;
  const hash = url.split('/').pop();
  const before = snapshot().counters['image.decode'] || 0;
  const notModified = await nativeFetch(base + url, { headers: { 'If-None-Match': `"${hash}"` } });
  assert.equal(notModified.status, 304);
  assert.equal(snapshot().counters['image.decode'] || 0, before);
  const responses = await Promise.all(Array.from({ length: 16 }, () => nativeFetch(base + url)));
  for (const response of responses) { assert.equal(response.status, 200); await response.arrayBuffer(); }
  assert.equal(snapshot().counters['image.decode'], before + 1);
  assert.equal(imageCacheStats().entries, 1);
  const changed = await api('/api/prizes/1', { name: 'new name' }, { method: 'PUT' });
  assert.equal(changed.status, 200); await changed.json();
  await (await nativeFetch(base + url)).arrayBuffer();
  assert.equal(snapshot().counters['image.decode'], before + 1);
  const removed = await api('/api/prizes/1', undefined, { method: 'DELETE' });
  assert.equal(removed.status, 200); await removed.json();
  assert.equal(imageCacheStats().entries, 0);
  assert.equal((await nativeFetch(base + url)).status, 404);
});

test('200000 records keep numeric deep pagination bounded and year caches invalidate on commit', async t => {
  await withWrite(connection => connection.exec(`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<200000)
    INSERT INTO records(prize_id,phone,vipcard,quantity,record_type,status,created_at)
    SELECT 1, 'phone-' || n, 'card-' || n, 1, 'draw', 0, '2026-06-01 00:00:00' FROM seq`), { records: true });
  for (const suffix of ['', '?page=20000', '?keyword=test&year=2026']) {
    const started = performance.now();
    const response = await api('/api/records' + suffix); const text = await response.text();
    const elapsed = performance.now() - started;
    assert.equal(response.status, 200);
    assert.ok(Buffer.byteLength(text) < 20000);
    assert.equal(JSON.parse(text).items.length, 10);
    assert.ok(elapsed < 200, `pagination took ${elapsed}ms`);
    t.diagnostic(`200000 records ${suffix || 'first page'}: ${elapsed.toFixed(1)}ms, ${Buffer.byteLength(text)} bytes`);
  }
  await withWrite(connection => connection.run("INSERT INTO records(prize_id,created_at) VALUES(1,'2027-01-01 00:00:00')"), { records: true });
  const result = await (await api('/api/records')).json();
  assert.deepEqual(result.years, ['2027','2026']);
});
