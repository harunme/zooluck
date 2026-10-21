import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('production entrypoint initializes isolated storage, becomes ready and shuts down its workers and database', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'zooluck-startup-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/index.js', import.meta.url))], {
    env: { ...process.env, DATABASE_PATH: path.join(directory, 'startup.db'), PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    const port = await new Promise((resolve, reject) => {
      let stdout = '';
      const timeout = setTimeout(() => reject(new Error('Startup timed out')), 10000);
      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        const match = /Server running on port (\d+)/.exec(stdout);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Exited before readiness: ${stderr}`)); });
    });
    const response = await fetch(`http://127.0.0.1:${port}/api/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ready' });
    child.kill('SIGTERM');
    const result = await Promise.race([exited, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Shutdown timed out')), 10000); timer.unref(); })]);
    assert.equal(result.code, 0, stderr);
    assert.equal(result.signal, null);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
});
