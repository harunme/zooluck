import { monitorEventLoopDelay } from 'node:perf_hooks';

const counters = new Map();
const timings = new Map();
export function count(name, amount = 1) { counters.set(name, (counters.get(name) || 0) + amount); }
export function observe(name, milliseconds) {
  const metric = timings.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
  metric.count++;
  metric.totalMs += milliseconds;
  metric.maxMs = Math.max(metric.maxMs, milliseconds);
  timings.set(name, metric);
}
export function snapshot() { return { counters: Object.fromEntries(counters), timings: Object.fromEntries(timings) }; }
export function startMetrics(extra) {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  let logging = false;
  const timer = setInterval(async () => {
    if (logging) return;
    logging = true;
    try {
      console.log(JSON.stringify({ event: 'performance', ...snapshot(), ...await extra(), eventLoopP95Ms: loop.percentile(95) / 1e6 }));
      loop.reset();
    } catch { /* Metrics must never interrupt business requests. */ }
    finally { logging = false; }
  }, 60000);
  timer.unref();
  return () => { clearInterval(timer); loop.disable(); };
}
