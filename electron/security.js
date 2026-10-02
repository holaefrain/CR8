import { app, session, shell } from 'electron';
import { SCRAPER_PARTITION } from './adapters/pageFetcher.js';

const EXTERNAL_HOSTS = new Set([
  'discogs.com', 'www.discogs.com',
  'beatport.com', 'www.beatport.com',
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'dymo.com', 'www.dymo.com',
  'github.com',
]);

export function isSafeExternal(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function openExternalSafely(url) {
  if (isSafeExternal(url)) shell.openExternal(url);
}

// Locks down every web contents: no new windows, no navigation away from the
// app, no permissions, no <webview>. Allow-listed links open in the browser.
export function applySecurity({ getAppOrigin }) {
  const scraper = session.fromPartition(SCRAPER_PARTITION);

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      // Hidden Beatport windows navigate freely within their own partition.
      if (contents.session === scraper) return;
      if (new URL(url).origin === getAppOrigin()) return;
      event.preventDefault();
      openExternalSafely(url);
    });
    contents.on('will-attach-webview', event => event.preventDefault());
  });

  for (const ses of [session.defaultSession, scraper]) {
    ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
  }
}

// Adds the per-launch secret to requests for the local server — and only
// those. Websites in the user's browser can't send it.
export function injectServerSecret(port, secret) {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`http://127.0.0.1:${port}/*`] },
    (details, callback) => {
      details.requestHeaders['X-CR8-Secret'] = secret;
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}
