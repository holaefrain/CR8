import { startServer } from './app.js';
import { createRpcClient } from './rpcClient.js';
import { createBinaries } from './binaries.js';

// Entry point inside Electron's utility process. Main sends one `init`
// message with paths + the per-launch secret; we start the server and report
// the port back. The token and profile stay behind the RPC ports.
const channel = process.parentPort;
if (!channel) {
  console.error('server/main.js runs inside the CR8 desktop app. For development use: npm run dev:server');
  process.exit(1);
}

let instance = null;

channel.on('message', async e => {
  const msg = e.data;
  if (msg?.type === 'init' && !instance) {
    try {
      const ports = createRpcClient(channel);
      instance = await startServer({
        ...ports,
        secret: msg.secret,
        dataDir: msg.dataDir,
        userAgent: msg.userAgent,
        binaries: createBinaries({ binDir: msg.binDir, ffmpegPath: msg.ffmpegPath, ytDlpOverride: msg.ytDlpOverride }),
      });
      channel.postMessage({ type: 'ready', port: instance.port });
    } catch (err) {
      channel.postMessage({ type: 'fatal', message: err.message });
    }
  } else if (msg?.type === 'shutdown') {
    await instance?.close().catch(() => {});
    process.exit(0);
  }
});
