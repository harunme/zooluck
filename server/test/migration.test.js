import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDB, initDB, closeDB } from '../src/db.js';
import { decodePrizeImage, prizeImageSource } from '../src/prize-images.js';

test('legacy migration is repeatable and preserves stock, credentials, records and image URLs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zooluck-migration-'));
  const filename = path.join(directory, 'legacy.db');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+1sAAAAASUVORK5CYII=';
  const expectedUrl = prizeImageSource(7, png);
  let legacy;
  let db;
  try {
    legacy = await openDB(filename);
    await legacy.exec(`
      CREATE TABLE prizes(id INTEGER PRIMARY KEY, name TEXT, image TEXT, quantity INTEGER, supplier TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE records(id INTEGER PRIMARY KEY, prize_id INTEGER, phone TEXT, vipcard TEXT, quantity INTEGER, record_type TEXT, status INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE admins(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE settings(id INTEGER PRIMARY KEY, setting_key TEXT UNIQUE, setting_value TEXT, description TEXT, created_at TEXT, updated_at TEXT);
      INSERT INTO admins(id,username,password) VALUES(3,'original','existing-hash');
      INSERT INTO settings(setting_key,setting_value) VALUES('redeem_password','existing-value');
      INSERT INTO records VALUES(11,7,'phone','card',1,'draw',0,'2026-06-01 00:00:00',NULL);
    `);
    await legacy.run('INSERT INTO prizes(id,name,image,quantity) VALUES(7,?,?,37)', ['original', png]);
    await legacy.close(); legacy = undefined;
    for (let iteration = 0; iteration < 2; iteration++) {
      db = await initDB(filename);
      const prize = await db.get('SELECT * FROM prizes WHERE id=7');
      assert.equal(prize.quantity, 37); assert.equal(prize.image, png);
      assert.equal(prize.image_hash, decodePrizeImage(png).hash);
      assert.equal(prize.image_mime, 'image/png');
      assert.equal(prizeImageSource(prize.id, '', prize.image_hash), expectedUrl);
      assert.equal((await db.get('SELECT password FROM admins WHERE id=3')).password, 'existing-hash');
      assert.equal((await db.get('SELECT COUNT(*) AS n FROM admins')).n, 1);
      assert.equal((await db.get('SELECT setting_value FROM settings')).setting_value, 'existing-value');
      assert.equal((await db.get('SELECT status FROM records WHERE id=11')).status, 0);
      assert.equal((await db.get('PRAGMA journal_mode')).journal_mode, 'wal');
      await closeDB(); db = undefined;
    }
  } finally {
    if (legacy) await legacy.close();
    if (db) await closeDB();
    await rm(directory, { recursive: true, force: true });
  }
});
