import express from 'express';
import { getDB } from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get all records (需要认证)
router.get('/', authenticateToken, async (_, res) => {
  try {
    const db = getDB();
    const records = await db.all(`
      SELECT r.id, r.prize_id, r.phone, r.vipcard, r.quantity, r.record_type, r.status, r.created_at, r.updated_at, p.name as prize_name, p.image as prize_image
      FROM records r
      LEFT JOIN prizes p ON r.prize_id = p.id
      ORDER BY r.created_at DESC
    `);
    res.json(records);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update record (需要认证)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const { quantity, record_type, status } = req.body;

    const db = getDB();

    // Check if record exists
    const record = await db.get('SELECT * FROM records WHERE id = ?', [recordId]);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const updateFields = [];
    const updateValues = [];

    if (quantity !== undefined) {
      updateFields.push('quantity = ?');
      updateValues.push(parseInt(quantity));
    }
    if (record_type !== undefined) {
      updateFields.push('record_type = ?');
      updateValues.push(record_type);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(parseInt(status));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateValues.push(recordId);
    const query = `UPDATE records SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.run(query, updateValues);

    const updatedRecord = await db.get('SELECT * FROM records WHERE id = ?', [recordId]);

    res.json(updatedRecord);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete record (需要认证)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const db = getDB();

    const record = await db.get('SELECT * FROM records WHERE id = ?', [recordId]);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    await db.run('DELETE FROM records WHERE id = ?', [recordId]);

    res.json(record);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
