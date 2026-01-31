import express from 'express';
import { getDB } from '../db.js';
import { authenticateToken } from './auth.js';

const router = express.Router();

// Get all prizes (需要认证)
router.get('/', authenticateToken, async (_, res) => {
  try {
    const db = getDB();
    const prizes = await db.all('SELECT * FROM prizes ORDER BY id');
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

    const db = getDB();
    const result = await db.run(
      'INSERT INTO prizes (name, image, quantity, supplier) VALUES (?, ?, ?, ?)',
      [name, image || null, parseInt(quantity), supplier]
    );

    res.status(201).json({
      id: result.lastID,
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

    const db = getDB();

    // Check if prize exists
    const prize = await db.get('SELECT * FROM prizes WHERE id = ?', [prizeId]);
    if (!prize) {
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
      return res.status(400).json({ message: 'No fields to update' });
    }

    updateValues.push(prizeId);
    const query = `UPDATE prizes SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.run(query, updateValues);

    // Fetch updated prize
    const updatedPrize = await db.get('SELECT * FROM prizes WHERE id = ?', [prizeId]);

    res.json(updatedPrize);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete prize (需要认证)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const prizeId = parseInt(req.params.id);
    const db = getDB();

    // Check if prize exists
    const prize = await db.get('SELECT * FROM prizes WHERE id = ?', [prizeId]);
    if (!prize) {
      return res.status(404).json({ message: 'Prize not found' });
    }

    await db.run('DELETE FROM prizes WHERE id = ?', [prizeId]);

    res.json(prize);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
