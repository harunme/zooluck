import { ServiceError } from './errors.js';
import { count, observe } from './metrics.js';

// A queued task times out only before it owns a resource. An executing task
// retains that resource until its actual completion, including rollback.
export class ResourcePool {
  constructor(resources, { limit, waitMs, name }) {
    this.available = [...resources];
    this.resources = [...resources];
    this.limit = limit;
    this.waitMs = waitMs;
    this.name = name;
    this.pending = [];
    this.active = 0;
    this.closing = false;
    this.idleWaiters = [];
  }

  run(task, { waitMs = this.waitMs } = {}) {
    if (this.closing) return Promise.reject(new ServiceError('SERVICE_STOPPING', '服务正在维护，请稍后重试'));
    if (!this.available.length && this.pending.length >= this.limit) {
      count(`${this.name}.rejected`);
      return Promise.reject(new ServiceError('QUEUE_FULL', '系统繁忙，请稍后重试'));
    }
    return new Promise((resolve, reject) => {
      const entry = { task, resolve, reject, created: performance.now() };
      if (this.available.length) this.execute(entry, this.available.shift());
      else {
        entry.timer = setTimeout(() => {
          const index = this.pending.indexOf(entry);
          if (index < 0) return;
          this.pending.splice(index, 1);
          count(`${this.name}.expired`);
          reject(new ServiceError('QUEUE_TIMEOUT', '等待超时，请稍后重试'));
        }, waitMs);
        this.pending.push(entry);
      }
    });
  }

  async execute(entry, resource) {
    clearTimeout(entry.timer);
    this.active++;
    observe(`${this.name}.wait`, performance.now() - entry.created);
    const started = performance.now();
    try { entry.resolve(await entry.task(resource)); }
    catch (error) { entry.reject(error); }
    finally {
      observe(`${this.name}.work`, performance.now() - started);
      this.active--;
      const next = this.pending.shift();
      if (next) this.execute(next, resource);
      else this.available.push(resource);
      if (!this.active && !this.pending.length) this.idleWaiters.splice(0).forEach(resolve => resolve());
    }
  }

  stats() { return { active: this.active, queued: this.pending.length, capacity: this.limit, closing: this.closing }; }
  async drain() {
    this.closing = true;
    if (this.active || this.pending.length) await new Promise(resolve => this.idleWaiters.push(resolve));
  }
}
