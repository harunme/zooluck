import db from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function setupAdmins() {
  console.log('开始创建管理员表和账户...');

  try {
    // 创建管理员表
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(255) UNIQUE NOT NULL COMMENT '管理员用户名',
        password VARCHAR(255) NOT NULL COMMENT '密码(bcrypt加密)',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员表'
    `);
    console.log('管理员表创建成功');

    // 检查是否已存在admin账户
    const [existing] = await db.query(
      'SELECT * FROM admins WHERE username = ?',
      ['admin']
    );

    if (existing.length > 0) {
      console.log('管理员账户已存在，跳过创建');
      process.exit(0);
    }

    // 创建管理员账户 (用户名: admin, 密码: admin123)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.query(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      ['admin', hashedPassword]
    );

    console.log('管理员账户创建成功！');
    console.log('用户名: admin');
    console.log('密码: admin123');
    console.log('\n请使用此账户登录管理后台');
  } catch (error) {
    console.error('设置失败:', error);
    process.exit(1);
  }

  process.exit(0);
}

setupAdmins();
