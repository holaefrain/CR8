import { ErrorCodes } from '/shared/errorCodes.js';

export { ErrorCodes };

export class ApiError extends Error {
  constructor(code, status, message, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

// Every failed call is announced on window so the app shell can react
// (e.g. show the "rotate your token" banner) without each caller knowing.
const announce = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));

async function toError(res) {
  const body = await res.json().catch(() => ({}));
  const { error, code, ...extra } = body || {};
  return new ApiError(code || ErrorCodes.INTERNAL, res.status, error || `Request failed (HTTP ${res.status})`, extra);
}

async function send(path, { method = 'GET', body, keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive,
    });
  } catch {
    throw new ApiError(ErrorCodes.INTERNAL, 0, 'CR8 could not reach its local service. Try restarting the app.');
  }
  if (!res.ok) throw await toError(res);
  return res;
}

// JSON request. Throttled requests are retried once after Discogs' wait,
// unless `retry: false` (for calls that must not run twice).
export async function api(path, { method, body, retry = true, keepalive } = {}) {
  try {
    const res = await send(path, { method, body, keepalive });
    return res.status === 204 ? null : res.json();
  } catch (e) {
    if (retry && e.code === ErrorCodes.DISCOGS_THROTTLED && e.extra.retryAfter <= 60) {
      announce('cr8:throttled', { retryAfter: e.extra.retryAfter });
      await new Promise(r => setTimeout(r, e.extra.retryAfter * 1000));
      return api(path, { method, body, retry: false, keepalive });
    }
    announce('cr8:api-error', e);
    throw e;
  }
}

// POST that streams newline-delimited JSON back, calling onLine per object.
export async function ndjson(path, body, onLine) {
  let res;
  try {
    res = await send(path, { method: 'POST', body });
  } catch (e) {
    announce('cr8:api-error', e);
    throw e;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    lines.filter(Boolean).forEach(line => onLine(JSON.parse(line)));
  }
  if (buf.trim()) onLine(JSON.parse(buf));
}
