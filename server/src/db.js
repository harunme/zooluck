import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'zooluck.db');

let db;

export async function initDB() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

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
  `);

  // 检查是否需要插入初始数据
  // const prizeCount = await db.get('SELECT COUNT(*) as count FROM prizes');
  // if (prizeCount.count === 0) {
  //   await db.exec(`
  //     INSERT INTO prizes (name, image, quantity, supplier) VALUES
  //     ('卡通宝宝车', '📝', 15516, '大连森林动物园'),
  //     ('主题原创绘本（小恐马的调皮)', '🌿', 6176, '大连森林动物园'),
  //     ('主题原创绘本（大熊猫宝宝的秘密)', '📚', 5262, '大连森林动物园'),
  //     ('小本', '📋', 4926, '大连森林动物园'),
  //     ('Zoo记念盾牌', '☂️', 3451, '大连森林动物园');
  //   `);
  // }

  const settingsCount = await db.get('SELECT COUNT(*) as count FROM settings');
  if (settingsCount.count === 0) {
    await db.exec(`
      INSERT INTO settings (setting_key, setting_value, description) VALUES
      ('redeem_password', '', '兑奖密码');
    `);
  }

  const hashedPassword = await bcrypt.hash('zooluck@123', 10);

  const adminCount = await db.get('SELECT COUNT(*) as count FROM admins');
  if (adminCount.count === 0) {
    await db.run(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      ['admin', hashedPassword]
    );
  }

  return db;
}

export function getDB() {
  return db;
}

export default { initDB, getDB };
