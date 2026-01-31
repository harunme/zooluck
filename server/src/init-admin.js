import db from './db.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function initAdmin() {
  const username = 'admin';
  const password = 'admin123';

  console.log('开始创建管理员账户...');

  try {
    // 检查是否已存在
    const [existing] = await db.query(
      'SELECT * FROM admins WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      console.log('管理员账户已存在');
      console.log(`用户名: ${username}`);
      console.log(`如需重置，请先手动删除该账户`);
      process.exit(0);
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入管理员
    await db.query(
      'INSERT INTO admins (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );

    console.log('管理员账户创建成功！');
    console.log(`用户名: ${username}`);
    console.log(`密码: ${password}`);
    console.log('\n请使用此账户登录管理后台');
  } catch (error) {
    console.error('创建管理员账户失败:', error);
    process.exit(1);
  }

  process.exit(0);
}

initAdmin();
