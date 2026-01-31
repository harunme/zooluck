import express from 'express';
import pool from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get all prizes (需要认证)
router.get('/', authenticateToken, async (_, res) => {
  try {
    const connection = await pool.getConnection();
    const [prizes] = await connection.query('SELECT * FROM prizes ORDER BY id');
    connection.release();
    res.json(prizes);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create prize (需要认证)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, image, quantity, supplier } = req.body;

    if (!name || !quantity || !supplier) {
      return res.status(400).json({ message: 'Missing required fields: name, quantity, supplier' });
    }

    const connection = await pool.getConnection();
    const [result] = await connection.query(
      'INSERT INTO prizes (name, image, quantity, supplier) VALUES (?, ?, ?, ?)',
      [name, image || null, parseInt(quantity), supplier]
    );
    connection.release();

    res.status(201).json({
      id: result.insertId,
      name,
      image: image || null,
      quantity: parseInt(quantity),
      supplier
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update prize (需要认证)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);
    const { name, image, quantity, supplier } = req.body;

    const connection = await pool.getConnection();

    // Check if prize exists
    const [prizes] = await connection.query('SELECT * FROM prizes WHERE id = ?', [prizeId]);
    if (prizes.length === 0) {
      connection.release();
      return res.status(404).json({ message: 'Prize not found' });
    }

    // Update prize
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (image !== undefined) {
      updateFields.push('image = ?');
      updateValues.push(image);
    }
    if (quantity !== undefined) {
      updateFields.push('quantity = ?');
      updateValues.push(parseInt(quantity));
    }
    if (supplier !== undefined) {
      updateFields.push('supplier = ?');
      updateValues.push(supplier);
    }

    if (updateFields.length === 0) {
      connection.release();
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateValues.push(prizeId);
    const query = `UPDATE prizes SET ${updateFields.join(', ')} WHERE id = ?`;
    await connection.query(query, updateValues);

    // Fetch updated prize
    const [updatedPrizes] = await connection.query('SELECT * FROM prizes WHERE id = ?', [prizeId]);
    connection.release();

    res.json(updatedPrizes[0]);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete prize (需要认证)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);
    const connection = await pool.getConnection();

    // Check if prize exists
    const [prizes] = await connection.query('SELECT * FROM prizes WHERE id = ?', [prizeId]);
    if (prizes.length === 0) {
      connection.release();
      return res.status(404).json({ message: 'Prize not found' });
    }

    const deletedPrize = prizes[0];
    await connection.query('DELETE FROM prizes WHERE id = ?', [prizeId]);
    connection.release();

    res.json(deletedPrize);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
