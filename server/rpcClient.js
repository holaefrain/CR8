import { RPC_METHODS } from './ports.js';
import { AppError } from './middleware/errors.js';

// Proxies the ports in ports.js over the utility process's parent port.
// `channel` is `process.parentPort` (or any object with on/postMessage).
export function createRpcClient(channel, { timeoutMs = 60_000 } = {}) {
  let nextId = 0;
  const pending = new Map();

  channel.on('message', e => {
    const msg = e?.data ?? e;
    if (msg?.type !== 'rpc-result') return;
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    clearTimeout(job.timer);
    if (!msg.error) return job.resolve(msg.result);
    const { code, status, message, extra } = msg.error;
    job.reject(code ? new AppError(code, status || 500, message, extra) : new Error(message));
  });

  function call(method, ...args) {
    if (!RPC_METHODS.includes(method)) return Promise.reject(new Error(`Unknown RPC method ${method}`));
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`RPC ${method} timed out`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      channel.postMessage({ type: 'rpc', id, method, args });
    });
  }

  const port = (name, methods) =>
    Object.fromEntries(methods.map(m => [m, (...args) => call(`${name}.${m}`, ...args)]));

  return {
    secretStore: port('secretStore', ['get', 'set', 'clear']),
    profileStore: port('profileStore', ['get', 'set']),
    settingsStore: port('settingsStore', ['get', 'set']),
    pageFetcher: port('pageFetcher', ['fetchHtml']),
  };
}
