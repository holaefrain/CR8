import { app, BrowserWindow, dialog, ipcMain, utilityProcess } from 'electron';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { applySecurity, injectServerSecret, openExternalSafely } from './security.js';
import { attachRpcHost } from './rpcHost.js';
import { createSecretStore } from './adapters/secretStore.js';
import { createProfileStore } from './adapters/profileStore.js';
import { createSettingsStore } from './adapters/settingsStore.js';
import { createPageFetcher } from './adapters/pageFetcher.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_ENTRY = path.join(ROOT, 'server', 'main.js');

if (!app.requestSingleInstanceLock()) app.exit(0);

let mainWindow = null;
let server = null;
let appOrigin = null;
let pageFetcher = null;

// ffmpeg-static resolves inside app.asar; executables must run unpacked.
const ffmpegPath = () => require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

function startServer(adapters, init) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(SERVER_ENTRY, [], { serviceName: 'CR8 Server', stdio: 'inherit' });
    attachRpcHost(child, adapters);
    child.on('message', msg => {
      if (msg?.type === 'ready') resolve({ child, port: msg.port });
      if (msg?.type === 'fatal') reject(new Error(msg.message));
    });
    child.once('exit', code => reject(new Error(`Server exited (${code})`)));
    child.postMessage({ type: 'init', ...init });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'CR8',
    backgroundColor: '#eef0f4',
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (!app.isPackaged) {
    mainWindow.webContents.on('console-message', ({ level, message, sourceId, lineNumber }) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${lineNumber})`);
    });
  }
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`${appOrigin}/`);
}

// Ask the page to save pending collection edits; give up after 1 s.
function flushRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, 1000);
    function done() { clearTimeout(timer); ipcMain.removeListener('cr8:flush-done', done); resolve(); }
    ipcMain.once('cr8:flush-done', done);
    mainWindow.webContents.send('cr8:flush');
  });
}

async function setupUpdater() {
  if (!app.isPackaged) return;
  const { autoUpdater } = (await import('electron-updater')).default;
  autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('cr8:update-ready'));
  ipcMain.on('cr8:restart-to-update', () => autoUpdater.quitAndInstall());
  const check = () => autoUpdater.checkForUpdatesAndNotify().catch(e => console.warn('[updater]', e.message));
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  applySecurity({ getAppOrigin: () => appOrigin });
  ipcMain.on('cr8:open-external', (_e, url) => openExternalSafely(url));

  const dataDir = app.getPath('userData');
  pageFetcher = createPageFetcher();
  const secret = crypto.randomBytes(32).toString('hex');

  try {
    const started = await startServer({
      secretStore: createSecretStore(dataDir),
      profileStore: createProfileStore(dataDir),
      settingsStore: createSettingsStore(dataDir),
      pageFetcher,
    }, {
      secret,
      dataDir,
      binDir: path.join(dataDir, 'bin'),
      ffmpegPath: ffmpegPath(),
      userAgent: `CR8/${app.getVersion()} +https://github.com/holaefrain/CR8`,
    });
    server = started.child;
    server.on('exit', code => {
      if (quitting) return;
      dialog.showErrorBox('CR8 stopped unexpectedly', `The background service exited (code ${code}). Please reopen CR8.`);
      app.exit(1);
    });
    appOrigin = `http://127.0.0.1:${started.port}`;
    injectServerSecret(started.port, secret);
  } catch (e) {
    console.error('[CR8] server failed to start:', e);
    app.exit(1);
    return;
  }

  createWindow();
  setupUpdater();

  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let quitting = false;
app.on('before-quit', async event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  await flushRenderer();
  pageFetcher?.destroyAll();
  if (server) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.postMessage({ type: 'shutdown' });
    await Promise.race([exited, new Promise(r => setTimeout(r, 2000))]);
    server.kill();
  }
  app.quit();
});
