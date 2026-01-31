import express from 'express';
import pool from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get all records (需要认证)
router.get('/', authenticateToken, async (_, res) => {
  try {
    const connection = await pool.getConnection();
    const [records] = await connection.query(`
      SELECT r.id, r.prize_id, r.phone, r.vipcard, r.quantity, r.record_type, r.status, r.created_at, r.updated_at, p.name as prize_name
      FROM records r
      LEFT JOIN prizes p ON r.prize_id = p.id
      ORDER BY r.created_at DESC
    `);
    connection.release();
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

    const connection = await pool.getConnection();

    // Check if record exists
    const [records] = await connection.query('SELECT * FROM records WHERE id = ?', [recordId]);
    if (records.length === 0) {
      connection.release();
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
      connection.release();
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateValues.push(recordId);
    const query = `UPDATE records SET ${updateFields.join(', ')} WHERE id = ?`;
    await connection.query(query, updateValues);

    const [updatedRecords] = await connection.query('SELECT * FROM records WHERE id = ?', [recordId]);
    connection.release();

    res.json(updatedRecords[0]);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete record (需要认证)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const connection = await pool.getConnection();

    const [records] = await connection.query('SELECT * FROM records WHERE id = ?', [recordId]);
    if (records.length === 0) {
      connection.release();
      return res.status(404).json({ message: 'Record not found' });
    }

    const deletedRecord = records[0];
    await connection.query('DELETE FROM records WHERE id = ?', [recordId]);
    connection.release();

    res.json(deletedRecord);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
