import express from 'express';
import jwt from 'jsonwebtoken';
import { withRead, withWrite } from '../db.js';
import { hashPassword, comparePassword } from '../passwords.js';
import { sendError, ServiceError } from '../errors.js';
import { TokenBucket } from '../rate-limit.js';
import { config } from '../config.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'zooluck-secret-key-2026';
const adminLimits = new TokenBucket(config.adminRate, config.adminBurst);
export const resetAdminLimits = () => adminLimits.clear();

export const authenticateToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, message: '未授权访问', code: 'UNAUTHORIZED' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'token无效或已过期', code: 'UNAUTHORIZED' });
  }
};
const adminLimit = (req, res, next) => {
  try { adminLimits.check(String(req.user.id)); next(); }
  catch (error) { sendError(res, error); }
};
const validCredentials = (username, password) => typeof username === 'string' && username.length > 0 && typeof password === 'string' && password.length > 0;

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!validCredentials(username, password)) throw new ServiceError('INVALID_INPUT', '用户名和密码不能为空', 400);
    const admin = await withRead(db => db.get('SELECT id, username, password FROM admins WHERE username = ?', username));
    if (!admin || !await comparePassword(password, admin.password)) {
      return res.status(401).json({ success: false, message: '用户名或密码错误', code: 'INVALID_CREDENTIALS' });
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: '登录成功', data: { username: admin.username, token } });
  } catch (error) { sendError(res, error); }
});

router.get('/verify', authenticateToken, (req, res) => res.json({ success: true, data: req.user }));

// Initial deployment still creates the first account; further creation requires login.
router.post('/create', authenticateToken, adminLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!validCredentials(username, password)) throw new ServiceError('INVALID_INPUT', '用户名和密码不能为空', 400);
    const exists = await withRead(db => db.get('SELECT id FROM admins WHERE username = ?', username));
    if (exists) throw new ServiceError('ADMIN_EXISTS', '用户名已存在', 400);
    const hash = await hashPassword(password);
    await withWrite(async db => {
      if (await db.get('SELECT id FROM admins WHERE username = ?', username)) throw new ServiceError('ADMIN_EXISTS', '用户名已存在', 400);
      await db.run('INSERT INTO admins (username, password) VALUES (?, ?)', [username, hash]);
    });
    res.json({ success: true, message: '管理员创建成功' });
  } catch (error) { sendError(res, error); }
});

router.post('/change-password', authenticateToken, adminLimit, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      throw new ServiceError('INVALID_INPUT', '请填写当前密码，新密码不能少于4位', 400);
    }
    const admin = await withRead(db => db.get('SELECT id, password FROM admins WHERE id = ?', req.user.id));
    if (!admin) throw new ServiceError('ADMIN_NOT_FOUND', '用户不存在', 404);
    if (!await comparePassword(currentPassword, admin.password)) throw new ServiceError('INVALID_PASSWORD', '当前密码错误', 400);
    const hash = await hashPassword(newPassword);
    await withWrite(async db => {
      const result = await db.run('UPDATE admins SET password = ? WHERE id = ? AND password = ?', [hash, admin.id, admin.password]);
      if (result.changes !== 1) throw new ServiceError('PASSWORD_CHANGED', '密码已变化，请重新登录后重试', 409);
    });
    res.json({ message: '密码修改成功' });
  } catch (error) { sendError(res, error); }
});

export default router;
