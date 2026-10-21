import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { ResourcePool } from './resource-pool.js';
import { ServiceError } from './errors.js';
import { decodePrizeImage } from './prize-images.js';
import { stat } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(__dirname, '..', 'data', 'zooluck.db');

let db;
let activeDbPath = dbPath;
let writers;
let readers;
let revision = 0;
let recordRevision = 0;
const commitListeners = new Set();
export const onCommit = listener => { commitListeners.add(listener); return () => commitListeners.delete(listener); };
export const getRevision = () => revision;
export const getRecordRevision = () => recordRevision;
export function invalidateData(changes = { images: true, records: true }) {
  revision++;
  if (changes.records) recordRevision++;
  for (const listener of commitListeners) {
    try { listener(changes); }
    catch { console.error(JSON.stringify({ event: 'cache_invalidation_error' })); }
  }
}
export const databaseStats = () => ({ writes: writers?.stats(), reads: readers?.stats() });
export async function databaseFileStats() {
  try { return { walBytes: (await stat(`${activeDbPath}-wal`)).size }; }
  catch { return { walBytes: 0 }; }
}
export const databaseReady = () => Boolean(writers && !writers.closing && readers && !readers.closing);

export function withRead(task, { snapshot = false, ...options } = {}) {
  if (!readers) return Promise.reject(new ServiceError('DATABASE_NOT_READY', '服务尚未就绪'));
  return readers.run(async connection => {
    if (!snapshot) return task(connection);
    await connection.exec('BEGIN');
    try { const result = await task(connection); await connection.exec('COMMIT'); return result; }
    catch (error) { await connection.exec('ROLLBACK'); throw error; }
  }, options);
}

export function withWrite(task, changes = {}) {
  if (!writers) return Promise.reject(new ServiceError('DATABASE_NOT_READY', '服务尚未就绪'));
  return writers.run(async connection => {
    for (let attempt = 0; ; attempt++) {
      let transaction = false;
      try {
        await connection.exec('BEGIN IMMEDIATE');
        transaction = true;
        const result = await task(connection);
        await connection.exec('COMMIT');
        transaction = false;
        // Invalidation happens before this connection can serve the next task.
        invalidateData(changes);
        return result;
      } catch (error) {
        if (transaction) await connection.exec('ROLLBACK');
        if (!['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error.code) || attempt >= 2) throw error;
        await new Promise(resolve => setTimeout(resolve, [10, 30][attempt]));
      }
    }
  });
}

export async function closeDB() {
  const pools = [writers, readers].filter(Boolean);
  await Promise.all(pools.map(pool => pool.drain()));
  await Promise.all(pools.flatMap(pool => pool.resources).map(connection => connection.close()));
  writers = readers = db = undefined;
}

// Used only during startup and fixture setup, never on a request path.
export async function refreshImageMetadata(connection = db) {
  for (const { id } of await connection.all('SELECT id FROM prizes')) {
    const row = await connection.get('SELECT image, image_hash, image_mime FROM prizes WHERE id = ?', id);
    const decoded = decodePrizeImage(row.image);
    const hash = decoded?.hash || null;
    const mime = decoded?.type || null;
    if (row.image_hash !== hash || row.image_mime !== mime) {
      await connection.run('UPDATE prizes SET image_hash = ?, image_mime = ? WHERE id = ?', [hash, mime, id]);
    }
    if (typeof row.image === 'string' && row.image.startsWith('data:') && !decoded) {
      console.warn(JSON.stringify({ event: 'invalid_legacy_artwork', prizeId: id }));
    }
  }
  invalidateData();
}

// Additional connections are for startup/tests only. Request paths use the bounded pools.
export async function openDB(filename = activeDbPath) {
  const connection = await open({
    filename,
    driver: sqlite3.Database
  });
  try {
    await connection.exec(`PRAGMA busy_timeout = ${config.sqliteWait}; PRAGMA synchronous = FULL;`);
    return connection;
  } catch (error) {
    await connection.close();
    throw error;
  }
}

export async function initDB(filename = dbPath) {
  if (writers || readers) await closeDB();
  activeDbPath = filename;
  db = await openDB();
  const mode = await db.get('PRAGMA journal_mode = WAL');
  if (mode.journal_mode !== 'wal') { await db.close(); db = undefined; throw new Error('WAL is required'); }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      supplier TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prize_id INTEGER,
      phone TEXT,
      vipcard TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      record_type TEXT,
      status INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prize_id) REFERENCES prizes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_prizes_supplier ON prizes(supplier);
    CREATE INDEX IF NOT EXISTS idx_records_prize_id ON records(prize_id);
    CREATE INDEX IF NOT EXISTS idx_records_phone ON records(phone);
    CREATE INDEX IF NOT EXISTS idx_records_vipcard ON records(vipcard);
    CREATE INDEX IF NOT EXISTS idx_records_created_at ON records(created_at);
    CREATE INDEX IF NOT EXISTS idx_records_created_at_id ON records(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_records_identity_time ON records(vipcard, phone, created_at DESC, id DESC);
  `);

  const columns = new Set((await db.all('PRAGMA table_info(prizes)')).map(column => column.name));
  for (const column of ['image_hash', 'image_mime']) {
    if (!columns.has(column)) await db.exec(`ALTER TABLE prizes ADD COLUMN ${column} TEXT`);
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_prizes_image_hash ON prizes(image_hash)');
  await refreshImageMetadata(db);

  const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    await db.exec(`
      INSERT INTO settings (setting_key, setting_value, description) VALUES
      ('redeem_password', '', '兑奖密码');
    `);
  }

  const adminCount = await db.get('SELECT COUNT(*) as count FROM admins');
  if (adminCount.count === 0) {
    const hashedPassword = await bcrypt.hash('zooluck@123', 10);
    await db.run(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      ['admin', hashedPassword]
    );
  }

  const connections = [];
  try {
    for (let index = 0; index < 2; index++) {
      const connection = await openDB();
      connections.push(connection);
      await connection.exec('PRAGMA query_only = ON');
    }
    writers = new ResourcePool([db], { limit: config.writeQueue, waitMs: config.writeWait, name: 'database.write' });
    readers = new ResourcePool(connections, { limit: config.readQueue, waitMs: config.readWait, name: 'database.read' });
  } catch (error) {
    await Promise.all(connections.map(connection => connection.close()));
    await db.close();
    db = undefined;
    throw error;
  }
  return db;
}

// Fixture inspection only; production routes must use withRead/withWrite.
export function getDB() {
  return db;
}

export default { initDB, getDB };
