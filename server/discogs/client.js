import { AppError } from '../middleware/errors.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

const API = 'https://api.discogs.com';
const WINDOW_MS = 60_000;

// Discogs allows 60 authenticated requests per minute per token (moving
// window). This client owns all pacing: it queues a request for up to
// `maxQueueWaitMs`, and beyond that fails fast with DISCOGS_THROTTLED so the
// UI can show a countdown instead of hanging.
export function createDiscogsClient({
  getToken,
  userAgent,
  fetch = globalThis.fetch,
  now = Date.now,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  perMinute = 55,
  maxQueueWaitMs = 5_000,
  timeoutMs = 10_000,
}) {
  const sent = [];      // scheduled send times inside the current window, ascending
  let pausedUntil = 0;  // set when Discogs tells us to back off

  function reserveSlot() {
    const t = now();
    while (sent.length && sent[0] <= t - WINDOW_MS) sent.shift();
    let at = Math.max(t, pausedUntil);
    if (sent.length >= perMinute) at = Math.max(at, sent[sent.length - perMinute] + WINDOW_MS);
    const wait = at - t;
    if (wait > maxQueueWaitMs) {
      const retryAfter = Math.ceil(wait / 1000);
      throw new AppError(ErrorCodes.DISCOGS_THROTTLED, 429,
        `Discogs rate limit reached. Try again in ${retryAfter}s.`, { retryAfter });
    }
    sent.push(at);
    sent.sort((a, b) => a - b);
    return wait;
  }

  async function request(path, { method = 'GET', query, body, token, auth = true } = {}) {
    let authToken = null;
    if (auth) {
      authToken = token ?? await getToken();
      if (!authToken) {
        throw new AppError(ErrorCodes.NOT_ONBOARDED, 412, 'Connect your Discogs token first.');
      }
    }

    const wait = reserveSlot();
    if (wait > 0) await sleep(wait);

    const url = new URL(API + path);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'User-Agent': userAgent,
          ...(authToken ? { Authorization: `Discogs token=${authToken}` } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = e?.name === 'TimeoutError';
      throw new AppError(ErrorCodes.DISCOGS_UPSTREAM, timedOut ? 504 : 502,
        timedOut ? 'Discogs took too long to respond.' : 'Could not reach Discogs. Check your connection.');
    }

    if (res.headers.get('x-discogs-ratelimit-remaining') === '0') {
      pausedUntil = Math.max(pausedUntil, now() + 15_000);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 60;
      pausedUntil = Math.max(pausedUntil, now() + retryAfter * 1000);
      throw new AppError(ErrorCodes.DISCOGS_THROTTLED, 429,
        `Discogs rate limit reached. Try again in ${retryAfter}s.`, { retryAfter });
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return data;

    if (res.status === 401) {
      throw new AppError(ErrorCodes.DISCOGS_TOKEN_INVALID, 401,
        'Discogs rejected your token. Generate a new one and rotate it in the Discogs tab.');
    }
    if (res.status === 404) {
      throw new AppError(ErrorCodes.NOT_FOUND, 404, data?.message || 'Not found on Discogs.');
    }
    throw new AppError(ErrorCodes.DISCOGS_UPSTREAM, 502, data?.message || `Discogs error (HTTP ${res.status}).`);
  }

  const verbs = token => ({
    get: (path, query, opts) => request(path, { ...opts, query, token }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body, token }),
    put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body, token }),
  });

  return {
    ...verbs(undefined),
    // One-off calls with a token that isn't saved yet (identity check).
    withToken: token => verbs(token),
  };
}
