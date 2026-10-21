import express from 'express';
import { withRead, withWrite } from '../db.js';
import { authenticateToken } from './auth.js';
import { sendError, ServiceError } from '../errors.js';

const router = express.Router();
router.get('/redeem-password', authenticateToken, async (_, res) => {
  try {
    const row = await withRead(db => db.get('SELECT setting_value AS value FROM settings WHERE setting_key = ?', 'redeem_password'));
    res.json({ value: row?.value ?? null });
  } catch (error) { sendError(res, error); }
});
router.put('/redeem-password', authenticateToken, async (req, res) => {
  try {
    const { redeemPassword } = req.body;
    if (typeof redeemPassword !== 'string' || redeemPassword.length < 4) throw new ServiceError('INVALID_INPUT', '密码长度不能少于4位', 400);
    await withWrite(db => db.run(
      `INSERT INTO settings (setting_key, setting_value, description) VALUES ('redeem_password', ?, '领取密码')
       ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value`, redeemPassword));
    res.json({ message: '设置更新成功', updatedAt: new Date().toISOString() });
  } catch (error) { sendError(res, error); }
});
export default router;
