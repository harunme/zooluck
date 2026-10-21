import express from 'express';
import cors from 'cors';
import prizeRoutes from './routes/prizes.js';
import recordRoutes from './routes/records.js';
import settingsRoutes from './routes/settings.js';
import lotteryRoutes from './routes/lottery.js';
import authRoutes, { authenticateToken, resetAdminLimits } from './routes/auth.js';
import { withRead, databaseReady } from './db.js';
import { passwordStats } from './passwords.js';
import { config } from './config.js';
import { TokenBucket } from './rate-limit.js';
import { ServiceError, routeError } from './errors.js';

const app = express();
let draining = false;
export const setDraining = value => { draining = value; };
const gameLimits = new TokenBucket(config.gameRate, config.gameBurst);
const loginLimits = new TokenBucket(config.loginRate, config.loginBurst);
export function resetRequestLimits() { gameLimits.clear(); loginLimits.clear(); resetAdminLimits(); }
app.set('trust proxy', 'loopback');
app.use(cors());
app.use('/api', (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use((req, res, next) => {
  try {
    if (draining && !['/api/health', '/api/ready'].includes(req.path)) throw new ServiceError('SERVICE_STOPPING', '服务正在维护，请稍后重试');
    if (req.method === 'POST' && /^\/api\/lottery\/(draw|exchange)$/.test(req.path)) gameLimits.check(req.ip);
    if (req.method === 'POST' && req.path === '/api/auth/login') loginLimits.check(req.ip);
    next();
  } catch (error) { routeError(req, res, error); }
});

const smallJson = express.json({ limit: config.bodyBytes });
const smallForm = express.urlencoded({ limit: config.bodyBytes, extended: false, parameterLimit: 20 });
const uploadJson = express.json({ limit: config.uploadBytes });
app.use((req, res, next) => {
  const upload = (req.method === 'POST' && req.path === '/api/prizes') || (req.method === 'PUT' && /^\/api\/prizes\/[^/]+$/.test(req.path));
  const parse = () => {
    if (upload && !req.is('application/json')) return next(new ServiceError('UNSUPPORTED_TYPE', '图片上传请使用 JSON 格式', 415));
    const parser = upload ? uploadJson : req.is('application/x-www-form-urlencoded') ? smallForm : smallJson;
    parser(req, res, error => { if (error) next(error); else { req.body ||= {}; next(); } });
  };
  // Reject unauthorized large uploads before allocating/parsing their JSON body.
  if (upload || ['/api/auth/create', '/api/auth/change-password'].includes(req.path)) authenticateToken(req, res, parse);
  else parse();
});

app.use('/api/auth', authRoutes);
app.use('/api/prizes', prizeRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/', lotteryRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));
app.get('/api/ready', async (_, res) => {
  let timer;
  try {
    if (draining || !databaseReady() || !passwordStats().ready) return res.status(503).json({ status: 'not_ready' });
    await Promise.race([
      withRead(db => db.get('SELECT id FROM prizes LIMIT 1'), { waitMs: 500 }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), 500); })
    ]);
    res.json({ status: 'ready' });
  } catch { res.status(503).json({ status: 'not_ready' }); }
  finally { clearTimeout(timer); }
});
app.use((_, res) => res.status(404).json({ error: 'API route not found', code: 'NOT_FOUND' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large' || error.type === 'parameters.too.many') error = new ServiceError('BODY_TOO_LARGE', '提交内容过大，请减少内容或图片大小', 413);
  else if (error.type === 'entity.parse.failed') error = new ServiceError('INVALID_JSON', '请求格式无效', 400);
  routeError(req, res, error);
});
export default app;
