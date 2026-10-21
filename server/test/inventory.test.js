import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initDB, openDB, closeDB, refreshImageMetadata } from '../src/db.js';
import { drawPrize } from '../src/lottery.js';
import lotteryRoutes from '../src/routes/lottery.js';
import prizeRoutes from '../src/routes/prizes.js';
import recordRoutes from '../src/routes/records.js';

let directory;
let db;

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'zooluck-inventory-'));
  db = await initDB(path.join(directory, 'test.db'));
});

beforeEach(async () => {
  await db.exec('DROP TRIGGER IF EXISTS reject_record; DELETE FROM records; DELETE FROM prizes;');
  await db.run('INSERT INTO prizes (id, name, quantity, supplier) VALUES (1, ?, 3, ?)', ['测试奖品', '测试']);
});

after(async () => {
  if (db) await closeDB();
  if (directory) await rm(directory, { recursive: true, force: true });
});

// Exercise the actual Express endpoint handler; auth is outside these inventory tests.
async function invoke(router, method, routePath, body = {}, params = {}) {
  const route = router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route;
  const res = {
    statusCode: 200,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; }
  };
  await route.stack[route.stack.length - 1].handle({ body, params }, res);
  assert.notEqual(res.body, undefined);
  return res;
}

const quantity = async () => (await db.get('SELECT quantity FROM prizes WHERE id = 1')).quantity;
const recordCount = async () => (await db.get('SELECT COUNT(*) AS count FROM records')).count;

test('draw response uses cacheable artwork instead of inline image data', async () => {
  await db.run('UPDATE prizes SET image = ? WHERE id = 1', ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+1sAAAAASUVORK5CYII=']);
  await refreshImageMetadata();
  const result = await drawPrize('phone', 'card');
  assert.equal(result.status, 1);
  assert.match(result.prizeimg, /^\/api\/prizes\/1\/image\/[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('base64'));
  assert.equal(await quantity(), 2);
});

test('successful draw deducts once, repeat and redemption never deduct again', async () => {
  const result = await drawPrize('13800000000', '01234567890');
  assert.equal(result.status, 1);
  assert.equal(result.cardno, '01234567890');
  assert.equal(await quantity(), 2);
  assert.equal((await drawPrize('13800000000', '01234567890')).status, 3);
  assert.equal(await quantity(), 2);
  await db.run("UPDATE settings SET setting_value = 'test-password' WHERE setting_key = 'redeem_password'");
  // Set the record's year explicitly to the exchange endpoint's current-year rule.
  await db.run('UPDATE records SET created_at = ? WHERE id = ?', [`${new Date().getFullYear()}-06-01 00:00:00`, result.record_id]);
  const exchanged = await invoke(lotteryRoutes, 'post', '/api/lottery/exchange', {
    phone: '13800000000', vipcard: '01234567890', parssword: 'test-password'
  });
  assert.equal(exchanged.body.error, 0);
  assert.equal(await quantity(), 2);
  assert.equal((await drawPrize('13800000000', '01234567890')).status, 4);
  assert.equal(await quantity(), 2);
  assert.equal(await recordCount(), 1);
});

test('concurrent users cannot oversell the last prize', async () => {
  await db.run('UPDATE prizes SET quantity = 1');
  const results = await Promise.all([0, 1, 2].map(i => drawPrize(`phone-${i}`, `card-${i}`)));
  assert.equal(results.filter(result => result.status === 1).length, 1);
  assert.equal(results.filter(result => result.prizename === '奖品已抽完').length, 2);
  assert.equal(await quantity(), 0);
  assert.equal(await recordCount(), 1);
});

test('concurrent duplicate requests create one record and reserve one prize', async () => {
  const results = await Promise.all([0, 1, 2].map(() => drawPrize('same-phone', 'same-card')));
  assert.equal(results.filter(result => result.status === 1).length, 1);
  assert.equal(results.filter(result => result.status === 3).length, 2);
  assert.equal(new Set(results.map(result => result.record_id)).size, 1);
  assert.equal(await quantity(), 2);
  assert.equal(await recordCount(), 1);
});

test('record insertion failure rolls stock back and releases the transaction', async () => {
  await db.exec("CREATE TRIGGER reject_record BEFORE INSERT ON records BEGIN SELECT RAISE(ABORT, 'test insert failure'); END");
  await assert.rejects(drawPrize('phone', 'card'), /test insert failure/);
  assert.equal(await quantity(), 3);
  assert.equal(await recordCount(), 0);
  await db.exec('DROP TRIGGER reject_record');
  assert.equal((await drawPrize('phone', 'card')).status, 1);
});

test('a failed commit rolls back the reservation and the next request can proceed', async t => {
  const original = db.exec.bind(db);
  let fail = true;
  t.mock.method(db, 'exec', async sql => {
    if (sql === 'COMMIT' && fail) { fail = false; throw Object.assign(new Error('test commit failure'), { code: 'SQLITE_IOERR' }); }
    return original(sql);
  });
  await assert.rejects(drawPrize('commit-phone', 'commit-card'), { code: 'SQLITE_IOERR' });
  assert.equal(await quantity(), 3);
  assert.equal(await recordCount(), 0);
  assert.equal((await drawPrize('commit-phone', 'commit-card')).status, 1);
  assert.equal(await quantity(), 2);
});

test('empty pool creates no record; a prior winner still sees their prize', async () => {
  await db.run('UPDATE prizes SET quantity = 1');
  await drawPrize('winner', 'card');
  assert.deepEqual(await drawPrize('new-user', 'new-card'), { status: 2, prizename: '奖品已抽完' });
  assert.equal((await drawPrize('winner', 'card')).status, 3);
  assert.equal(await recordCount(), 1);
});

test('zero-stock prizes are excluded while other prizes remain drawable', async () => {
  await db.run('UPDATE prizes SET quantity = 0');
  await db.run("INSERT INTO prizes (id, name, quantity) VALUES (2, 'other', 1)");
  assert.equal((await drawPrize('phone', 'card')).lottery_id, 2);
  assert.equal(await quantity(), 0);
});

test('draw endpoint verifies membership before reserving inventory', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ Code: '200', Content: JSON.stringify({ subCode: '0' }) })));
  const rejected = await invoke(lotteryRoutes, 'post', '/api/lottery/draw', { phone: 'phone', vipcard: 'card' });
  assert.equal(rejected.body.status, 2);
  assert.equal(await quantity(), 3);
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ Code: '200', Content: JSON.stringify({ subCode: '1' }) })));
  const accepted = await invoke(lotteryRoutes, 'post', '/api/lottery/draw', { phone: 'phone', vipcard: 'card' });
  assert.equal(accepted.body.status, 1);
  assert.equal(await quantity(), 2);
});

test('metadata edits cannot restore stock; stale stock edits conflict atomically', async () => {
  await drawPrize('phone', 'card');
  const metadata = await invoke(prizeRoutes, 'put', '/:id', { name: '新名称' }, { id: '1' });
  assert.equal(metadata.statusCode, 200);
  assert.equal(await quantity(), 2);
  const stale = await invoke(prizeRoutes, 'put', '/:id', {
    name: '不应保存', quantity: 10, expectedQuantity: 3
  }, { id: '1' });
  assert.equal(stale.statusCode, 409);
  assert.equal((await db.get('SELECT name FROM prizes WHERE id = 1')).name, '新名称');
  assert.equal(await quantity(), 2);
  const accepted = await invoke(prizeRoutes, 'put', '/:id', { quantity: 0, expectedQuantity: 2 }, { id: '1' });
  assert.equal(accepted.statusCode, 200);
  assert.equal(await quantity(), 0);
});

test('stock adjustments racing a draw either conflict or deduct from adjusted stock', async () => {
  const [draw, update] = await Promise.all([
    drawPrize('phone', 'card'),
    invoke(prizeRoutes, 'put', '/:id', { quantity: 10, expectedQuantity: 3 }, { id: '1' })
  ]);
  assert.equal(draw.status, 1);
  assert.ok([200, 409].includes(update.statusCode));
  assert.equal(await quantity(), update.statusCode === 200 ? 9 : 2);
});

test('creation allows zero; malformed quantities and missing comparison are rejected', async () => {
  const created = await invoke(prizeRoutes, 'post', '/', { name: '空库存', supplier: '测试', quantity: 0 });
  assert.equal(created.statusCode, 201);
  for (const invalid of [-1, 1.5, '3', '3junk', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await invoke(prizeRoutes, 'post', '/', { name: 'invalid', supplier: 'test', quantity: invalid })).statusCode, 400);
    assert.equal((await invoke(prizeRoutes, 'put', '/:id', { quantity: invalid, expectedQuantity: 3 }, { id: '1' })).statusCode, 400);
    assert.equal((await invoke(prizeRoutes, 'put', '/:id', { quantity: 2, expectedQuantity: invalid }, { id: '1' })).statusCode, 400);
  }
  assert.equal((await invoke(prizeRoutes, 'put', '/:id', { quantity: 2 }, { id: '1' })).statusCode, 400);
  assert.equal(await quantity(), 3);
});

test('editing and deleting winning records never automatically replenish inventory', async () => {
  const result = await drawPrize('phone', 'card');
  assert.equal((await invoke(recordRoutes, 'put', '/:id', { status: 1 }, { id: String(result.record_id) })).statusCode, 200);
  assert.equal(await quantity(), 2);
  assert.equal((await invoke(recordRoutes, 'delete', '/:id', {}, { id: String(result.record_id) })).statusCode, 200);
  assert.equal(await quantity(), 2);
});

test('writer lock timeout is retryable and leaves inventory untouched', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ Code: '200', Content: JSON.stringify({ subCode: '1' }) })));
  const lock = await openDB();
  await lock.exec('BEGIN IMMEDIATE');
  try {
    const result = await invoke(lotteryRoutes, 'post', '/api/lottery/draw', { phone: 'phone', vipcard: 'card' });
    assert.equal(result.body.status, 2);
    assert.equal(result.body.prizename, '抽奖繁忙，请稍后重试');
  } finally {
    await lock.exec('ROLLBACK');
    await lock.close();
  }
  assert.equal(await quantity(), 3);
  assert.equal(await recordCount(), 0);
  assert.equal((await drawPrize('phone', 'card')).status, 1);
});
