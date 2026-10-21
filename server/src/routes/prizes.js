import express from 'express';
import { withRead, withWrite } from '../db.js';
import { authenticateToken } from './auth.js';
import { decodePrizeImage, serializePrize, validImageInput, prizeProjection } from '../prize-images.js';
import { cachedImage } from '../image-cache.js';
import { sendError, ServiceError } from '../errors.js';

const router = express.Router();
const isQuantity = value => Number.isSafeInteger(value) && value >= 0;
const invalid = message => new ServiceError('INVALID_INPUT', message, 400);
const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;

router.get('/:id/image/:hash', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!/^[1-9]\d*$/.test(req.params.id) || !/^[a-f0-9]{64}$/.test(req.params.hash)) return res.status(404).end();
    const prize = await withRead(db => db.get('SELECT image_hash, image_mime FROM prizes WHERE id = ?', req.params.id));
    if (!prize?.image_hash || prize.image_hash !== req.params.hash) return res.status(404).end();
    const etag = `"${prize.image_hash}"`;
    res.set({ 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    const validators = (req.headers['if-none-match'] || '').split(',').map(value => value.trim().replace(/^W\//, ''));
    if (validators.includes(etag) || validators.includes('*')) return res.status(304).end();
    const image = await cachedImage(prize.image_hash);
    res.type(image.type).send(image.bytes);
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    if (error.status === 404) return res.status(404).end();
    sendError(res, error);
  }
});

router.get('/', authenticateToken, async (_, res) => {
  try { res.json((await withRead(db => db.all(`SELECT ${prizeProjection()} FROM prizes ORDER BY id`))).map(serializePrize)); }
  catch (error) { sendError(res, error); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, image, quantity, supplier } = req.body;
    if (!validText(name) || !validText(supplier)) throw invalid('奖品名称和提供商须为 1–200 字符');
    if (!isQuantity(quantity)) throw invalid('剩余可抽数量必须为非负安全整数');
    if (!validImageInput(image)) throw invalid('图片须为不超过 5 MiB 的有效 Base64 图片或表情，不能提交图片地址');
    const decoded = decodePrizeImage(image);
    const prize = await withWrite(async db => {
      const result = await db.run('INSERT INTO prizes (name, image, quantity, supplier, image_hash, image_mime) VALUES (?, ?, ?, ?, ?, ?)',
        [name, image || null, quantity, supplier, decoded?.hash || null, decoded?.type || null]);
      return db.get(`SELECT ${prizeProjection()} FROM prizes WHERE id = ?`, result.lastID);
    }, { images: true });
    res.status(201).json(serializePrize(prize));
  } catch (error) { sendError(res, error); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { name, image, quantity, supplier, expectedQuantity } = req.body;
    if ((name !== undefined && !validText(name)) || (supplier !== undefined && !validText(supplier))) throw invalid('奖品名称和提供商须为 1–200 字符');
    if (quantity !== undefined && (!isQuantity(quantity) || !isQuantity(expectedQuantity))) throw invalid('修改库存须提供有效的 quantity 和 expectedQuantity（非负安全整数）');
    if (!validImageInput(image)) throw invalid('图片须为不超过 5 MiB 的有效 Base64 图片或表情，不能提交图片地址');
    const decoded = image === undefined ? undefined : decodePrizeImage(image);
    const fields = [], values = [];
    for (const [key, value] of Object.entries({ name, image, quantity, supplier })) {
      if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
    }
    if (!fields.length) throw invalid('No fields to update');
    if (image !== undefined) { fields.push('image_hash = ?', 'image_mime = ?'); values.push(decoded?.hash || null, decoded?.type || null); }
    const prize = await withWrite(async db => {
      if (!await db.get('SELECT id FROM prizes WHERE id = ?', req.params.id)) throw new ServiceError('PRIZE_NOT_FOUND', 'Prize not found', 404);
      const parameters = [...values, req.params.id];
      if (quantity !== undefined) parameters.push(expectedQuantity);
      const updated = await db.run(`UPDATE prizes SET ${fields.join(', ')} WHERE id = ?${quantity !== undefined ? ' AND quantity = ?' : ''}`, parameters);
      if (updated.changes !== 1) throw new ServiceError('STOCK_CONFLICT', '奖品或库存已变化，请刷新核对后重试', 409);
      return db.get(`SELECT ${prizeProjection()} FROM prizes WHERE id = ?`, req.params.id);
    }, { images: image !== undefined });
    res.json(serializePrize(prize));
  } catch (error) { sendError(res, error); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const prize = await withWrite(async db => {
      const row = await db.get(`SELECT ${prizeProjection()} FROM prizes WHERE id = ?`, req.params.id);
      if (!row) throw new ServiceError('PRIZE_NOT_FOUND', 'Prize not found', 404);
      await db.run('DELETE FROM prizes WHERE id = ?', req.params.id);
      return row;
    }, { images: true, records: true });
    res.json(serializePrize(prize));
  } catch (error) { sendError(res, error); }
});
export default router;
