import { withWrite } from './db.js';
import { prizeImageSource, prizeProjection } from './prize-images.js';

// SQLite serializes writers across connections and processes. Keep the eligibility
// check, prize selection, stock reservation and record on this one connection.
export async function drawPrize(phone, vipcard) {
  return withWrite(async db => {

    const lastRecord = await db.get(
      `SELECT r.*, p.name as prizename FROM records r
       LEFT JOIN prizes p ON r.prize_id = p.id
       WHERE r.vipcard = ? AND r.phone = ?
       ORDER BY r.created_at DESC LIMIT 1`,
      [vipcard, phone]
    );

    let response;
    if (lastRecord) {
      response = {
        status: lastRecord.status === 1 ? 4 : 3,
        prizename: lastRecord.prizename,
        created_at: lastRecord.created_at,
        record_id: lastRecord.id,
        ...(lastRecord.status === 1 ? {} : { lottery_id: lastRecord.prize_id })
      };
    } else {
      const prizes = await db.all(`SELECT ${prizeProjection()} FROM prizes WHERE quantity > 0`);
      const total = prizes.reduce((sum, prize) => sum + prize.quantity, 0);

      if (prizes.length === 0) {
        response = { status: 2, prizename: '奖品已抽完' };
      } else {
        const random = Math.random() * total;
        let cumulative = 0;
        const prize = prizes.find(candidate => {
          cumulative += candidate.quantity;
          return random < cumulative;
        }) || prizes[prizes.length - 1];

        const reservation = await db.run(
          'UPDATE prizes SET quantity = quantity - 1 WHERE id = ? AND quantity > 0',
          [prize.id]
        );
        if (reservation.changes !== 1) {
          throw new Error('Prize stock reservation failed');
        }

        const record = await db.run(
          'INSERT INTO records (prize_id, phone, vipcard, quantity, record_type, status) VALUES (?, ?, ?, ?, ?, ?)',
          [prize.id, phone, vipcard, 1, 'draw', 0]
        );
        response = {
          status: 1,
          prizename: prize.name,
          prizeimg: prizeImageSource(prize.id, prize.image, prize.image_hash),
          cardno: vipcard,
          phone,
          record_id: record.lastID,
          lottery_id: prize.id
        };
      }
    }

    return response;
  }, { records: true });
}
