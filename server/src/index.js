import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import prizeRoutes from './routes/prizes.js';
import recordRoutes from './routes/records.js';
import settingsRoutes from './routes/settings.js';
import lotteryRoutes from './routes/lottery.js';
import authRoutes from './routes/auth.js';
import { initDB } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 提供静态文件
// 1. 前端React应用 (构建后的文件)
app.use(express.static(path.join(projectRoot, 'client/build')));

// 2. H5游戏文件
app.use('/games', express.static(path.join(projectRoot, 'games')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/prizes', prizeRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/', lotteryRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA回退：所有非API请求都返回index.html，让React Router处理
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(projectRoot, 'client/build/index.html'));
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 查看管理后台`);
  console.log(`访问 http://localhost:${PORT}/games 查看H5游戏`);
});
