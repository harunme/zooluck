import express from 'express';
import pool from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get redeem password (需要认证)
router.get('/redeem-password', authenticateToken, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT setting_value as value FROM settings WHERE setting_key = ?',
      ['redeem_password']
    );
    connection.release();

    if (rows.length > 0) {
      res.json({ value: rows[0].value });
    } else {
      res.json({ value: null });
    }
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update redeem password (需要认证)
router.put('/redeem-password', authenticateToken, async (req, res) => {
  try {
    const { redeemPassword } = req.body;

    if (!redeemPassword) {
      return res.status(400).json({ message: 'redeemPassword is required' });
    }

    if (redeemPassword.length < 4) {
      return res.status(400).json({ message: '密码长度不能少于4位' });
    }

    const connection = await pool.getConnection();
    const [existing] = await connection.query(
      'SELECT * FROM settings WHERE setting_key = ?',
      ['redeem_password']
    );

    if (existing.length > 0) {
      await connection.query(
        'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
        [redeemPassword, 'redeem_password']
      );
    } else {
      await connection.query(
        'INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
        ['redeem_password', redeemPassword, '领取密码']
      );
    }

    connection.release();

    res.json({
      message: '设置更新成功',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
