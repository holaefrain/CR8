import { parentPort } from 'worker_threads';
import { analyzeSamples } from './analysis.js';

// Runs the CPU-heavy FFT / chromagram / tempo work off the HTTP thread.
parentPort.on('message', ({ id, samples, sampleRate }) => {
  try {
    parentPort.postMessage({ id, result: analyzeSamples(samples, sampleRate) });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message });
  }
});
