import { RPC_METHODS } from '../server/ports.js';
import { ErrorCodes } from '../shared/errorCodes.js';

// Answers the server's RPC calls with the adapters. Only methods on the
// shared allow-list are reachable; adapters validate their own arguments.
export function attachRpcHost(child, adapters, log = console) {
  child.on('message', async msg => {
    if (msg?.type !== 'rpc') return;
    const { id, method, args } = msg;
    try {
      if (!RPC_METHODS.includes(method)) throw new Error(`Method not allowed: ${method}`);
      const [portName, fn] = method.split('.');
      const result = await adapters[portName][fn](...(Array.isArray(args) ? args : []));
      child.postMessage({ type: 'rpc-result', id, result: result ?? null });
    } catch (e) {
      if (!e.cr8Code) log.error?.(`[rpc ${method}]`, e);
      child.postMessage({
        type: 'rpc-result',
        id,
        error: e.cr8Code
          ? { code: e.cr8Code, status: e.status, message: e.message }
          : { code: ErrorCodes.INTERNAL, status: 500, message: 'Something went wrong in the app. Please try again.' },
      });
    }
  });
}
