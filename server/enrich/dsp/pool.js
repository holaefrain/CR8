import { Worker } from 'worker_threads';
import os from 'os';

const WORKER_URL = new URL('./worker.js', import.meta.url);

// A small pool of analysis workers, started lazily. Samples are transferred
// (not copied) to the worker.
export function createDspPool({ size = Math.max(1, Math.min(2, os.cpus().length - 1)) } = {}) {
  const idle = [];
  const all = new Set();
  const queue = [];
  const pending = new Map();
  let nextId = 0;

  function spawnWorker() {
    const worker = new Worker(WORKER_URL);
    worker.on('message', ({ id, result, error }) => {
      const job = pending.get(id);
      pending.delete(id);
      if (job) error ? job.reject(new Error(error)) : job.resolve(result);
      release(worker);
    });
    worker.on('error', err => {
      for (const [id, job] of pending) {
        if (job.worker === worker) { pending.delete(id); job.reject(err); }
      }
      all.delete(worker);
      drain();
    });
    all.add(worker);
    return worker;
  }

  function release(worker) {
    idle.push(worker);
    drain();
  }

  function drain() {
    while (queue.length) {
      const worker = idle.pop() || (all.size < size ? spawnWorker() : null);
      if (!worker) return;
      const job = queue.shift();
      job.worker = worker;
      pending.set(job.id, job);
      worker.postMessage({ id: job.id, samples: job.samples, sampleRate: job.sampleRate }, [job.samples.buffer]);
    }
  }

  function analyze(samples, sampleRate) {
    return new Promise((resolve, reject) => {
      queue.push({ id: nextId++, samples, sampleRate, resolve, reject });
      drain();
    });
  }

  async function close() {
    await Promise.all([...all].map(w => w.terminate()));
    all.clear();
    idle.length = 0;
  }

  return { analyze, close };
}
