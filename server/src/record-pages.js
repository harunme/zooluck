import { withRead, getRecordRevision } from './db.js';
import { config } from './config.js';
import { prizeImageSource } from './prize-images.js';
import { ServiceError } from './errors.js';
let yearsCache;


function badQuery() {
  return new ServiceError('INVALID_QUERY', '分页、年份或搜索参数无效', 400);
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw badQuery();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) throw badQuery();
  return number;
}

export async function recordPage(query = {}) {
  const requestedPage = positiveInteger(query.page, 1);
  const pageSize = positiveInteger(query.pageSize, 10, 100);
  if (query.keyword !== undefined && typeof query.keyword !== 'string') throw badQuery();
  const keyword = (query.keyword || '').trim();
  if (keyword.length > 100) throw badQuery();
  const conditions = [];
  const parameters = [];
  if (query.year !== undefined) {
    if (typeof query.year !== 'string' || !/^[1-9]\d{3}$/.test(query.year) || Number(query.year) > 9998) throw badQuery();
    const year = Number(query.year);
    const utcBoundary = targetYear => new Date(Date.UTC(targetYear, 0, 1) - 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    conditions.push('r.created_at >= ? AND r.created_at < ?');
    parameters.push(utcBoundary(year), utcBoundary(year + 1));
  }
  return withRead(async db => {
    const revision = getRecordRevision();
    if (keyword) {
      const matches = await db.all("SELECT id FROM prizes WHERE name LIKE ? ESCAPE '\\'", [`%${keyword.replace(/[\\%_]/g, character => `\\${character}`)}%`]);
      if (matches.length) {
        conditions.push(`r.prize_id IN (${matches.map(() => '?').join(',')})`);
        parameters.push(...matches.map(row => row.id));
      } else conditions.push('0');
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { total } = await db.get(`SELECT COUNT(*) AS total FROM records r ${where}`, parameters);
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const ids = await db.all(`SELECT r.id FROM records r ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [...parameters, pageSize, (page - 1) * pageSize]);
    const items = ids.length ? await db.all(
      `SELECT r.id, r.prize_id, r.phone, r.vipcard, r.quantity, r.record_type,
              r.status, r.created_at, r.updated_at, p.name AS prize_name,
              p.image_hash, CASE WHEN p.image_hash IS NULL AND length(p.image) <= 256 AND p.image NOT LIKE 'data:%' THEN p.image ELSE '' END AS image
       FROM records r LEFT JOIN prizes p ON r.prize_id = p.id
       WHERE r.id IN (${ids.map(() => '?').join(',')}) ORDER BY r.created_at DESC, r.id DESC`, ids.map(row => row.id)
    ) : [];
    let years;
    if (yearsCache && yearsCache.revision === revision && yearsCache.expires > Date.now()) years = yearsCache.values;
    else {
      years = (await db.all("SELECT DISTINCT strftime('%Y', created_at, '+8 hours') AS year FROM records ORDER BY year DESC")).map(row => row.year).filter(Boolean);
      if (revision === getRecordRevision()) yearsCache = { values: years, revision, expires: Date.now() + config.yearsTtl };
    }
    return {
      items: items.map(({ image, image_hash, ...item }) => ({ ...item, prize_image: prizeImageSource(item.prize_id, image, image_hash) })),
      total, page, pageSize, years
    };
  }, { snapshot: true });
}
