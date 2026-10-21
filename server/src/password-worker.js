import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', async ({ operation, password, hash }) => {
  try {
    const result = operation === 'compare' ? await bcrypt.compare(password, hash) : await bcrypt.hash(password, 10);
    parentPort.postMessage({ result });
  } catch {
    parentPort.postMessage({ error: true });
  }
});
