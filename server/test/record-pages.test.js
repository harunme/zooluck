import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import app, { resetRequestLimits } from '../src/app.js';
import { initDB, closeDB, refreshImageMetadata, invalidateData } from '../src/db.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+1sAAAAASUVORK5CYII=';
let db, directory, server, base;
const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET || 'zooluck-secret-key-2026');

before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'zooluck-pages-'));
  db = await initDB(path.join(directory, 'test.db'));
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  resetRequestLimits();
  await db.exec('DELETE FROM records; DELETE FROM prizes;');
  await db.run('INSERT INTO prizes (id, name, image, quantity, supplier) VALUES (1, ?, ?, 3, ?)', ['绘本_100%', png, '动物园']);
  await db.run("INSERT INTO prizes (id, name, image, quantity, supplier) VALUES (2, 'other', '🦒', 2, '动物园')");
  await refreshImageMetadata();
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (db) await closeDB();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function api(url, options = {}) {
  return fetch(base + url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
  });
}

async function seed(count) {
  await db.exec('BEGIN');
  const statement = await db.prepare('INSERT INTO records (id, prize_id, phone, vipcard, quantity, record_type, status, created_at) VALUES (?, ?, ?, ?, 1, ?, 0, ?)');
  try {
    for (let id = 1; id <= count; id++) {
      await statement.run(id, id % 2 ? 1 : 2, `phone-${id}`, `card-${id}`, 'draw', '2026-05-01 00:00:00');
    }
  } finally {
    await statement.finalize();
    await db.exec('COMMIT');
    invalidateData({ records: true });
  }
}

test('business routes require auth and cannot be cached', async () => {
  for (const endpoint of ['/api/records', '/api/prizes']) {
    const response = await fetch(base + endpoint);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.arrayBuffer();
  }
});

test('pagination is bounded, ordered by time then id, and clamps the final page', async () => {
  await seed(23);
  const firstResponse = await api('/api/records');
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  const first = await firstResponse.json();
  assert.equal(first.total, 23);
  assert.deepEqual(first.items.map(row => row.id), [23,22,21,20,19,18,17,16,15,14]);
  assert.deepEqual(first.years, ['2026']);
  assert.equal(first.pageSize, 10);
  assert.ok(first.items[0].prize_image.startsWith('/api/prizes/1/image/'));
  assert.equal(first.items[1].prize_image, '🦒');
  assert.ok(!JSON.stringify(first).includes('base64'));
  const last = await (await api('/api/records?page=999')).json();
  assert.equal(last.page, 3);
  assert.deepEqual(last.items.map(row => row.id), [3,2,1]);
  await db.run('DELETE FROM records WHERE id IN (1,2,3)');
  const afterDelete = await (await api('/api/records?page=3')).json();
  assert.equal(afterDelete.page, 2);
  assert.equal(afterDelete.items.length, 10);
});

test('keyword search is literal and years are global even when results are empty', async () => {
  await seed(12);
  const literal = await (await api('/api/records?keyword=' + encodeURIComponent('_100%'))).json();
  assert.equal(literal.total, 6);
  assert.ok(literal.items.every(row => row.prize_name === '绘本_100%'));
  const empty = await (await api('/api/records?keyword=' + encodeURIComponent("%' OR 1=1 --"))).json();
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.deepEqual(empty.items, []);
  assert.deepEqual(empty.years, ['2026']);
  assert.equal((await (await api('/api/records?keyword=OTHER')).json()).total, 6);
  await db.run("UPDATE prizes SET name = 'a\\b' WHERE id = 2");
  assert.equal((await (await api('/api/records?keyword=' + encodeURIComponent('a\\b'))).json()).total, 6);
});

test('Beijing year filtering includes UTC boundary and excludes next year', async () => {
  await seed(4);
  const times = ['2025-12-31 15:59:59', '2025-12-31 16:00:00', '2026-12-31 15:59:59', '2026-12-31 16:00:00'];
  for (let id = 1; id <= 4; id++) await db.run('UPDATE records SET created_at = ? WHERE id = ?', [times[id - 1], id]);
  invalidateData({ records: true });
  const result = await (await api('/api/records?year=2026')).json();
  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map(row => row.id), [3,2]);
  assert.deepEqual(result.years, ['2027','2026','2025']);
});

test('invalid paging, keyword and year parameters are rejected', async () => {
  for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=1e2', 'page=9007199254740992', 'page=1&page=2', 'pageSize=101', 'pageSize=0', 'year=all', 'year=2026x', 'year=9999', 'keyword=' + 'a'.repeat(101)]) {
    const response = await api('/api/records?' + query);
    assert.equal(response.status, 400, query);
    await response.arrayBuffer();
  }
});

test('empty database and deleted prize references remain displayable', async () => {
  const empty = await (await api('/api/records')).json();
  assert.deepEqual(empty, { items: [], total: 0, page: 1, pageSize: 10, years: [] });
  await seed(1);
  await db.run('DELETE FROM prizes WHERE id = 1');
  const result = await (await api('/api/records')).json();
  assert.equal(result.total, 1);
  assert.equal(result.items[0].prize_image, '');
  assert.equal(result.items[0].prize_name, null);
});

test('public artwork uses binary responses, immutable version URLs and conditional requests', async () => {
  const prizes = await (await api('/api/prizes')).json();
  assert.ok(!JSON.stringify(prizes).includes('base64'));
  const url = prizes[0].image;
  const image = await fetch(base + url);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match(image.headers.get('cache-control'), /public.*immutable/);
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  const etag = image.headers.get('etag');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), Buffer.from(png.split(',')[1], 'base64'));
  const cached = await fetch(base + url, { headers: { 'If-None-Match': `W/${etag}` } });
  assert.equal(cached.status, 304);
  assert.equal((await cached.arrayBuffer()).byteLength, 0);
  await db.run('UPDATE prizes SET image = ? WHERE id = 1', ['data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')]);
  await refreshImageMetadata();
  const replaced = await (await api('/api/prizes')).json();
  assert.notEqual(replaced[0].image, url);
  const old = await fetch(base + url);
  assert.equal(old.status, 404);
  assert.equal(old.headers.get('cache-control'), 'no-store');
  const svg = await fetch(base + replaced[0].image);
  assert.match(svg.headers.get('content-security-policy'), /sandbox/);
  await svg.arrayBuffer();
});

test('image upload validation, serialization and unchanged-image metadata edits', async () => {
  const created = await api('/api/prizes', { method: 'POST', body: JSON.stringify({ name: 'new', quantity: 1, supplier: 'zoo', image: png }) });
  assert.equal(created.status, 201);
  const prize = await created.json();
  assert.match(prize.image, /^\/api\/prizes\//);
  const metadata = await api(`/api/prizes/${prize.id}`, { method: 'PUT', body: JSON.stringify({ name: 'new name' }) });
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json()).image, prize.image);
  for (const image of [prize.image, 'https://example.com/image.png', 'data:text/html;base64,YQ==', 'data:image/png;base64,YQ==', 'data:image/png;base64,not-base64!', 'data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')]) {
    const invalid = await api(`/api/prizes/${prize.id}`, { method: 'PUT', body: JSON.stringify({ image }) });
    assert.equal(invalid.status, 400);
    await invalid.arrayBuffer();
  }
  await db.run("UPDATE prizes SET image = 'data:image/png;base64,broken' WHERE id = 1");
  await refreshImageMetadata();
  assert.equal((await (await api('/api/prizes')).json())[0].image, '');
  const missing = await fetch(base + '/api/prizes/1/image/' + 'a'.repeat(64));
  assert.equal(missing.status, 404);
});

test('624 and 10000 image-bearing records return small bounded pages', async t => {
  // Valid PNG with trailing bytes simulates a larger existing uploaded artwork.
  const image = 'data:image/png;base64,' + Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.alloc(32 * 1024)]).toString('base64');
  await db.run('UPDATE prizes SET image = ?', [image]);
  await refreshImageMetadata();
  for (const count of [624, 10000]) {
    await db.exec('DELETE FROM records');
    await seed(count);
    const start = performance.now();
    const response = await api('/api/records');
    const text = await response.text();
    const elapsed = performance.now() - start;
    const result = JSON.parse(text);
    assert.equal(result.total, count);
    assert.equal(result.items.length, 10);
    assert.ok(Buffer.byteLength(text) < 20 * 1024);
    assert.ok(!text.includes('base64'));
    t.diagnostic(`${count} records: ${Buffer.byteLength(text)} bytes, ${elapsed.toFixed(1)} ms on localhost`);
  }
  const plan = await db.all('EXPLAIN QUERY PLAN SELECT id FROM records ORDER BY created_at DESC, id DESC LIMIT 10');
  const indexes = await db.all('PRAGMA index_list(records)');
  assert.ok(indexes.some(index => index.name === 'idx_records_created_at_id'));
  // SQLite may prefer the existing time index, whose implicit rowid also orders id.
  assert.ok(plan.some(row => row.detail.includes('INDEX')));
  assert.ok(!plan.some(row => row.detail.includes('TEMP B-TREE')));
});
