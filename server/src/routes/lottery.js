import express from 'express';
import { withRead, withWrite } from '../db.js';
import { drawPrize } from '../lottery.js';
import { membership } from '../membership.js';
import { ServiceError, sendError } from '../errors.js';

const router = express.Router();
function validIdentity(phone, card) { return typeof phone === 'string' && typeof card === 'string' && phone.trim() && card.trim() && phone.length <= 32 && card.length <= 64; }

router.post('/api/lottery/draw', async (req, res) => {
  try {
    const { phone, vipcard } = req.body;
    if (!validIdentity(phone, vipcard)) throw new ServiceError('INVALID_INPUT', '手机号或年卡号不能为空', 400);
    if (!await membership.verify(phone, vipcard)) return res.json({ status: 2, prizename: '亲~您还不是会员哦。' });
    res.json(await drawPrize(phone, vipcard));
  } catch (error) {
    if (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error.code)) error = new ServiceError('DATABASE_BUSY', '抽奖繁忙，请稍后重试');
    sendError(res, error, 'draw');
  }
});

export function beijingYearBounds(now = new Date()) {
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(now));
  const boundary = target => new Date(Date.UTC(target, 0, 1) - 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  return [boundary(year), boundary(year + 1)];
}
router.post('/api/lottery/exchange', async (req, res) => {
  try {
    const { parssword, phone, vipcard } = req.body;
    if (typeof parssword !== 'string' || !parssword || !validIdentity(phone, vipcard)) throw new ServiceError('INVALID_INPUT', '参数不完整', 400);
    const password = await withRead(db => db.get('SELECT setting_value FROM settings WHERE setting_key = ?', 'redeem_password'));
    if (!password?.setting_value || password.setting_value !== parssword) return res.json({ error: 1, msg: '兑奖密码错误' });
    const result = await withWrite(async db => {
      // Recheck the configuration inside the transaction if it changed while queued.
      const current = await db.get('SELECT setting_value FROM settings WHERE setting_key = ?', 'redeem_password');
      if (current?.setting_value !== parssword) return { error: 1, msg: '兑奖密码错误' };
      const record = await db.get(`SELECT id, status FROM records WHERE vipcard = ? AND phone = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 1`, [vipcard, phone, ...beijingYearBounds()]);
      if (!record) return { error: 1, msg: '兑奖码不存在或已过期' };
      if (record.status === 1) return { error: 1, msg: '该奖品已被兑奖' };
      const updated = await db.run(`UPDATE records SET status = 1, updated_at = datetime('now') WHERE id = ? AND status = 0`, record.id);
      return updated.changes === 1 ? { error: 0, msg: '兑奖成功' } : { error: 1, msg: '该奖品已被兑奖' };
    }, { records: true });
    res.json(result);
  } catch (error) { sendError(res, error, 'exchange'); }
});
export default router;
