// Caps how many async jobs run at once. Each caller gets its own instance, so
// e.g. Beatport windows and yt-dlp downloads queue independently.
export function createLimiter(concurrency) {
  let active = 0;
  const waiting = [];

  async function run(fn) {
    if (active >= concurrency) {
      await new Promise(resolve => waiting.push(resolve));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  }

  return { run, get active() { return active; }, get queued() { return waiting.length; } };
}
