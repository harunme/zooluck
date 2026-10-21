import { Worker } from 'node:worker_threads';
import { ResourcePool } from './resource-pool.js';
import { config } from './config.js';
import { ServiceError } from './errors.js';

let pool;
let starting;
let closing = false;
let warm = false;

export class PasswordWorker {
  async start() {
    if (this.stopping) throw new ServiceError('SERVICE_STOPPING', '服务正在维护');
    const worker = new Worker(new URL('./password-worker.js', import.meta.url), { execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type') && !arg.startsWith('--test')) });
    this.worker = worker;
    this.failed = false;
    worker.on('error', () => this.fail(worker));
    worker.on('exit', () => this.fail(worker));
    worker.on('message', message => {
      if (worker !== this.worker) return;
      const pending = this.pending;
      if (!pending) return;
      this.pending = undefined;
      worker.unref();
      if (message.error) pending.reject(new ServiceError('PASSWORD_FAILED', '密码服务暂时不可用'));
      else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => { worker.once('online', resolve); worker.once('error', reject); });
    worker.unref();
  }
  fail(worker) {
    if (worker !== this.worker) return;
    this.failed = true;
    if (this.pending) {
      this.pending.reject(new ServiceError('PASSWORD_WORKER_FAILED', '密码服务暂时不可用'));
      this.pending = undefined;
    }
    this.scheduleRepair();
  }
  scheduleRepair() {
    if (this.repairTimer || this.repairing || this.stopping) return;
    this.repairTimer = setTimeout(() => { this.repairTimer = undefined; this.repair().catch(() => {}); }, 1000);
    this.repairTimer.unref();
  }
  async repair() {
    if (this.repairing) return this.repairing;
    if (this.stopping) throw new ServiceError('SERVICE_STOPPING', '服务正在维护');
    clearTimeout(this.repairTimer); this.repairTimer = undefined;
    this.repairing = (async () => {
      const old = this.worker;
      this.worker = undefined;
      if (old) await old.terminate();
      await this.start();
      await this.send({ operation: 'compare', password: '', hash: '' });
    })().finally(() => {
      this.repairing = undefined;
      if (this.failed) this.scheduleRepair();
    });
    return this.repairing;
  }
  send(message) {
    this.worker.ref();
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      try { this.worker.postMessage(message); }
      catch { this.fail(this.worker); }
    });
  }
  async run(message) {
    if (this.failed || this.repairing || !this.worker) await this.repair();
    return this.send(message);
  }
  async close() {
    this.stopping = true;
    clearTimeout(this.repairTimer);
    if (this.repairing) await this.repairing.catch(() => {});
    if (this.worker) await this.worker.terminate();
  }
}

export async function startPasswords() {
  if (closing) throw new ServiceError('SERVICE_STOPPING', '服务正在维护');
  if (starting) return starting;
  if (pool) return;
  starting = (async () => {
    const workers = [new PasswordWorker(), new PasswordWorker()];
    try {
      await Promise.all(workers.map(worker => worker.start()));
      await Promise.all(workers.map(worker => worker.run({ operation: 'compare', password: '', hash: '' })));
      pool = new ResourcePool(workers, { limit: config.passwordQueue, waitMs: config.passwordWait, name: 'password' });
      warm = true;
    } catch (error) {
      await Promise.all(workers.map(worker => worker.close()));
      pool = undefined;
      throw error;
    }
  })().finally(() => { starting = undefined; });
  await starting;
}
async function calculate(message) { await startPasswords(); return pool.run(worker => worker.run(message)); }
export const hashPassword = password => calculate({ operation: 'hash', password });
export const comparePassword = (password, hash) => calculate({ operation: 'compare', password, hash });
export const passwordStats = () => ({ ...pool?.stats(), ready: warm && !closing && pool.resources.every(worker => !worker.failed && !worker.repairing) });
export async function closePasswords() {
  closing = true;
  if (starting) await starting.catch(() => {});
  if (pool) { await pool.drain(); await Promise.all(pool.resources.map(resource => resource.close())); }
  pool = undefined;
  warm = false;
  closing = false;
}
