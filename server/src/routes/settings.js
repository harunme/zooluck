import express from 'express';
import { getDB } from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get redeem password (需要认证)
router.get('/redeem-password', authenticateToken, async (req, res) => {
  try {
    const db = getDB();
    const row = await db.get(
      'SELECT setting_value as value FROM settings WHERE setting_key = ?',
      ['redeem_password']
    );

    if (row) {
      res.json({ value: row.value });
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

    const db = getDB();
    const existing = await db.get(
      'SELECT * FROM settings WHERE setting_key = ?',
      ['redeem_password']
    );

    if (existing) {
      await db.run(
        'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
        [redeemPassword, 'redeem_password']
      );
    } else {
      await db.run(
        'INSERT INTO settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
        ['redeem_password', redeemPassword, '领取密码']
      );
    }

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
