import express from 'express';
import pool from '../db.js';

const router = express.Router();

/**
 * 按照概率获取随机奖品
 * 奖品数量即为权重，概率 = 奖品数量 / 所有奖品总数
 */
async function getRandomPrize(connection) {
  try {
    const [prizes] = await connection.query('SELECT * FROM prizes WHERE quantity > 0');
    
    if (prizes.length === 0) {
      return null;
    }

    // 计算总数量
    const totalQuantity = prizes.reduce((sum, prize) => sum + prize.quantity, 0);
    
    if (totalQuantity === 0) {
      return null;
    }

    // 生成 0 到 totalQuantity 之间的随机数
    const randomValue = Math.random() * totalQuantity;
    
    // 累计概率，找到对应的奖品
    let cumulativeQuantity = 0;
    for (const prize of prizes) {
      cumulativeQuantity += prize.quantity;
      if (randomValue < cumulativeQuantity) {
        return prize;
      }
    }

    // 如果由于浮点数精度问题未命中，返回最后一个奖品
    return prizes[prizes.length - 1];
  } catch (error) {
    console.error('获取奖品错误:', error);
    return null;
  }
}

// ==================== 用户接口 ====================

/**
 * POST /api/lottery/draw - 执行抽奖 (AjaxReturnPrize)
 * 参数: phone, vipcard, id, token
 * 返回: {status: 1/2/3/4, prizename, record_id, lottery_id}
 */
router.post('/api/lottery/draw', async (req, res) => {
  try {
    const { phone, vipcard } = req.body;

    if (!phone || !vipcard) {
      return res.json({
        status: 2,
        prizename: '手机号或年卡号不能为空'
      });
    }

    const connection = await pool.getConnection();

    try {
      // 检查年卡是否已抽过奖
      const [existingRecords] = await connection.query(
        'SELECT * FROM records WHERE vipcard = ? ORDER BY created_at DESC LIMIT 1',
        [vipcard]
      );

      if (existingRecords.length > 0) {
        const lastRecord = existingRecords[0];

        if (lastRecord.status === 1) {
          return res.json({
            status: 4,
            prizename: '您已经领取过奖品',
            record_id: lastRecord.id,
            lottery_id: lastRecord.prize_id
          });
        }

        const [prize] = await connection.query('SELECT name FROM prizes WHERE id = ?', [lastRecord.prize_id]);
        return res.json({
          status: 3,
          prizename: prize.length > 0 ? prize[0].name : '奖品',
          record_id: lastRecord.id,
          lottery_id: lastRecord.prize_id
        });
      }

      const prize = await getRandomPrize(connection);
      if (!prize) {
        return res.json({
          status: 2,
          prizename: '抽奖系统异常，请稍后重试'
        });
      }

      const [result] = await connection.query(
        'INSERT INTO records (prize_id, phone, vipcard, quantity, record_type, status) VALUES (?, ?, ?, ?, ?, ?)',
        [prize.id, phone, vipcard, 1, 'draw', 0]
      );

      const recordId = result.insertId;

      res.json({
        status: 1,
        prizename: prize.name,
        record_id: recordId,
        lottery_id: prize.id
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('抽奖接口错误:', error);
    res.status(500).json({
      status: 2,
      prizename: '系统错误，请稍后重试'
    });
  }
});

/**
 * POST /api/lottery/exchange - 兑奖 (exchange)
 * 参数: parssword (兑奖密码), phone (手机号), vipcard (会员卡号)
 * 返回: {error: 0/1, msg}
 */
router.post('/api/lottery/exchange', async (req, res) => {
  try {
    const { parssword, phone, vipcard } = req.body;

    if (!parssword || !phone || !vipcard) {
      return res.json({
        error: 1,
        msg: '参数不完整'
      });
    }

    const connection = await pool.getConnection();

    try {
      // 获取当前年份
      const currentYear = new Date().getFullYear();
      
      // 先检查该用户今年是否有中奖记录
      const [existingRecords] = await connection.query(
        `SELECT * FROM records WHERE phone = ? AND vipcard = ? AND YEAR(created_at) = ?`,
        [phone, vipcard, currentYear]
      );

      if (existingRecords.length === 0) {
        return res.json({
          error: 1,
          msg: '兑奖码不存在或已过期'
        });
      }

      const record = existingRecords[0];

      // 检查是否已经兑奖过
      if (record.status === 1) {
        return res.json({
          error: 1,
          msg: '该奖品已被兑奖'
        });
      }

      // 验证兑奖密码
      const [settings] = await connection.query(
        'SELECT setting_value FROM settings WHERE setting_key = ?',
        ['redeem_password']
      );

      if (settings.length === 0 || !settings[0].setting_value || settings[0].setting_value !== parssword) {
        return res.json({
          error: 1,
          msg: '兑奖密码错误'
        });
      }

      // 更新记录状态为已兑奖
      await connection.query(
        'UPDATE records SET status = 1, updated_at = NOW() WHERE id = ?',
        [record.id]
      );

      res.json({
        error: 0,
        msg: '兑奖成功'
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('兑奖接口错误:', error);
    res.status(500).json({
      error: 1,
      msg: '系统错误，请稍后重试'
    });
  }
});

export default router;
