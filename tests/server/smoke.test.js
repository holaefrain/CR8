import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: '3100' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  await new Promise((resolve, reject) => {
    child.once('error', reject);
    const timer = setTimeout(() => reject(new Error(`Server start timed out. stdout: ${stdout}\nstderr: ${stderr}`)), 8000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('http://localhost:3100')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  return child;
}

async function main() {
  const child = await startServer();
  try {
    const res = await fetch('http://127.0.0.1:3100/api/config');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.hasDiscogsToken, 'boolean');
    assert.equal(typeof body.discogsUsername, 'string');

    const indexRes = await fetch('http://127.0.0.1:3100/');
    assert.equal(indexRes.status, 200);
    const html = await indexRes.text();
    assert.match(html, /\/js\/app\.js/);

    const appScriptRes = await fetch('http://127.0.0.1:3100/js/app.js');
    assert.equal(appScriptRes.status, 200);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => {});
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
