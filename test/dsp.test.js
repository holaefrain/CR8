import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { createDspPool } from '../server/enrich/dsp/pool.js';

const RATE = 22050;

// 30 s click track at 120 BPM: short decaying 1 kHz bursts every 0.5 s.
function clickTrack(seconds = 30, bpm = 120) {
  const samples = new Float32Array(RATE * seconds);
  const every = Math.round(RATE * 60 / bpm);
  for (let start = 0; start < samples.length; start += every) {
    for (let i = 0; i < 800 && start + i < samples.length; i++) {
      samples[start + i] = Math.sin(2 * Math.PI * 1000 * i / RATE) * Math.exp(-i / 150);
    }
  }
  return samples;
}

test('analysis runs off the main thread: HTTP stays responsive', async () => {
  const pool = createDspPool({ size: 1 });
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  try {
    await fetch(url).then(r => r.text()); // warm up the HTTP client
    const analysis = pool.analyze(clickTrack(), RATE);
    const latencies = [];
    let done = false;
    analysis.finally(() => { done = true; });
    while (!done) {
      const t0 = performance.now();
      await fetch(url).then(r => r.text());
      latencies.push(performance.now() - t0);
      await new Promise(r => setTimeout(r, 20));
    }
    const { bpm, key } = await analysis;
    assert.ok(Math.abs(bpm - 120) <= 2, `bpm ${bpm}`);
    assert.equal(typeof key, 'string');
    assert.ok(latencies.length > 0);
    assert.ok(Math.max(...latencies) < 50, `max latency ${Math.max(...latencies).toFixed(1)}ms`);
  } finally {
    server.close();
    await pool.close();
  }
});
