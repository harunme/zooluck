import express from 'express';
import { withWrite } from '../db.js';
import { authenticateToken } from './auth.js';
import { recordPage } from '../record-pages.js';
import { ServiceError, sendError } from '../errors.js';

const router = express.Router();
router.get('/', authenticateToken, async (req, res) => {
  try { res.json(await recordPage(req.query)); }
  catch (error) { sendError(res, error); }
});
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { quantity, record_type, status } = req.body;
    if ((quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity < 1)) || (status !== undefined && ![0, 1].includes(status)) || (record_type !== undefined && !['draw', 'redeem'].includes(record_type))) {
      throw new ServiceError('INVALID_INPUT', '记录参数无效', 400);
    }
    const fields = [], values = [];
    for (const [key, value] of Object.entries({ quantity, record_type, status })) {
      if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
    }
    if (!fields.length) throw new ServiceError('INVALID_INPUT', 'No fields to update', 400);
    const record = await withWrite(async db => {
      const result = await db.run(`UPDATE records SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...values, req.params.id]);
      if (!result.changes) throw new ServiceError('RECORD_NOT_FOUND', 'Record not found', 404);
      return db.get('SELECT * FROM records WHERE id = ?', req.params.id);
    }, { records: true });
    res.json(record);
  } catch (error) { sendError(res, error); }
});
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const record = await withWrite(async db => {
      const row = await db.get('SELECT * FROM records WHERE id = ?', req.params.id);
      if (!row) throw new ServiceError('RECORD_NOT_FOUND', 'Record not found', 404);
      await db.run('DELETE FROM records WHERE id = ?', req.params.id);
      return row;
    }, { records: true });
    res.json(record);
  } catch (error) { sendError(res, error); }
});
export default router;
