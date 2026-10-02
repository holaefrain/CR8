import { BrowserWindow, session } from 'electron';
import { appError } from './jsonFile.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

export const SCRAPER_PARTITION = 'persist:beatport';
const ALLOWED_HOSTS = new Set(['www.beatport.com']);
const ALLOWED_SELECTORS = new Set(['script#__NEXT_DATA__']);
const POOL_SIZE = 2;
const IDLE_MS = 60_000;

// Loads Beatport pages in hidden, sandboxed browser windows. A real Chromium
// passes Cloudflare's managed challenge on its own, and the clearance cookie
// persists in this partition — this replaces FlareSolverr.
export function createPageFetcher() {
  const ses = session.fromPartition(SCRAPER_PARTITION);
  ses.setUserAgent(ses.getUserAgent().replace(/\s?(Electron|CR8|cr8)\/\S+/g, ''));
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  const idle = [];
  let open = 0;
  const waiters = [];

  function makeWindow() {
    open++;
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        partition: SCRAPER_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    win.webContents.setAudioMuted(true);
    win.on('closed', () => { open--; });
    return win;
  }

  async function acquire() {
    const entry = idle.pop();
    if (entry) { clearTimeout(entry.timer); return entry.win; }
    if (open < POOL_SIZE) return makeWindow();
    return new Promise(resolve => waiters.push(resolve));
  }

  function release(win) {
    if (win.isDestroyed()) return;
    const next = waiters.shift();
    if (next) return next(win);
    const entry = { win, timer: setTimeout(() => { idle.splice(idle.indexOf(entry), 1); win.destroy(); }, IDLE_MS) };
    idle.push(entry);
  }

  async function fetchHtml(url, { waitFor, timeoutMs = 30_000 } = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { throw appError(ErrorCodes.VALIDATION, 'Invalid URL'); }
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) throw appError(ErrorCodes.VALIDATION, 'URL not allowed');
    if (!ALLOWED_SELECTORS.has(waitFor)) throw appError(ErrorCodes.VALIDATION, 'Selector not allowed');
    const ms = Math.min(Math.max(Number(timeoutMs) || 30_000, 1_000), 60_000);

    const win = await acquire();
    try {
      // Cloudflare may serve a challenge page first and then navigate to the
      // real page, which aborts this load — so poll for the element instead.
      win.loadURL(parsed.href).catch(() => {});
      const deadline = Date.now() + ms;
      const probe = `document.querySelector(${JSON.stringify(waitFor)})?.outerHTML ?? null`;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
        if (win.isDestroyed()) throw new Error('Window closed');
        const html = await win.webContents.executeJavaScript(probe).catch(() => null);
        if (html) return html;
      }
      throw new Error('Timed out waiting for page');
    } finally {
      release(win);
    }
  }

  function destroyAll() {
    for (const { win, timer } of idle.splice(0)) { clearTimeout(timer); win.destroy(); }
  }

  return { fetchHtml, destroyAll };
}
