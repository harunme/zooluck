import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import prizeRoutes from './routes/prizes.js';
import recordRoutes from './routes/records.js';
import settingsRoutes from './routes/settings.js';
import lotteryRoutes from './routes/lottery.js';
import authRoutes from './routes/auth.js';
import { initDB } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// 404 处理：所有未匹配的 API 路由
app.use((req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api`);
});
