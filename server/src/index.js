import 'dotenv/config';
import app, { setDraining } from './app.js';
import { initDB, closeDB, databaseStats, databaseFileStats } from './db.js';
import { startPasswords, closePasswords, passwordStats } from './passwords.js';
import { membership } from './membership.js';
import { imageCacheStats } from './image-cache.js';
import { startMetrics } from './metrics.js';

const PORT = process.env.PORT || 3001;
await initDB();
await startPasswords();
const stopMetrics = startMetrics(async () => ({ database: databaseStats(), ...await databaseFileStats(), passwords: passwordStats(), member: membership.stats(), images: imageCacheStats() }));
const server = app.listen(PORT, () => console.log(`Server running on port ${server.address().port}`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  setDraining(true);
  stopMetrics();
  const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000);
  deadline.unref();
  try {
    const closed = new Promise(resolve => server.close(resolve));
    server.closeIdleConnections();
    await Promise.all([closed, membership.drain()]);
    await Promise.all([closeDB(), closePasswords()]);
    clearTimeout(deadline);
  } catch { process.exitCode = 1; }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
