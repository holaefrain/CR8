import { api, ErrorCodes } from '../api.js';
import { esc, byId } from '../dom.js';
import * as store from './collectionStore.js';
import { initSearch } from './search.js';
import { initCollection, render as renderCollection } from './collection.js';
import { initExport, onShow as showExport } from './export.js';
import { initDiscogs, onShow as showDiscogs, openRotate } from './discogs.js';

// Camelot keys for the collection's key inputs.
const CAMELOT = [
  ['1A', 'Ab minor'], ['1B', 'B major'], ['2A', 'Eb minor'], ['2B', 'Gb major'],
  ['3A', 'Bb minor'], ['3B', 'Db major'], ['4A', 'F minor'], ['4B', 'Ab major'],
  ['5A', 'C minor'], ['5B', 'Eb major'], ['6A', 'G minor'], ['6B', 'Bb major'],
  ['7A', 'D minor'], ['7B', 'F major'], ['8A', 'A minor'], ['8B', 'C major'],
  ['9A', 'E minor'], ['9B', 'G major'], ['10A', 'B minor'], ['10B', 'D major'],
  ['11A', 'F# minor'], ['11B', 'A major'], ['12A', 'C# minor'], ['12B', 'E major'],
];

const TAB_SHOWN = {
  collection: renderCollection,
  export: showExport,
  discogs: showDiscogs,
};

function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
  TAB_SHOWN[tab]?.();
}

// ── Banner (one at a time) ───────────────────────────────
let bannerTimer = null;
function showBanner(html, { error = false, action, actionLabel, timeoutMs } = {}) {
  const el = byId('app-banner');
  clearTimeout(bannerTimer);
  el.className = 'app-banner' + (error ? ' error' : '');
  el.innerHTML = `<div><span>${html}</span>${action ? `<button class="btn">${esc(actionLabel)}</button>` : ''}</div>`;
  el.hidden = false;
  if (action) el.querySelector('button').addEventListener('click', action, { once: true });
  if (timeoutMs) bannerTimer = setTimeout(hideBanner, timeoutMs);
}
const hideBanner = () => { byId('app-banner').hidden = true; };

function countdown(seconds) {
  let left = seconds;
  const tick = () => {
    if (left <= 0) return hideBanner();
    showBanner(`Discogs rate limit — retrying in ${left}s…`);
    left--;
    bannerTimer = setTimeout(tick, 1000);
  };
  tick();
}

async function init() {
  const me = await api('/api/me');
  if (!me.onboarded) { location.href = '/'; return; }

  const dl = document.createElement('datalist');
  dl.id = 'camelot-list';
  dl.innerHTML = CAMELOT.map(([code, name]) =>
    `<option value="${code} — ${name}"></option><option value="${name}"></option>`).join('');
  document.body.appendChild(dl);

  byId('header-user').textContent = `${me.firstName ? `Hi ${me.firstName} · ` : ''}@${me.discogsUsername}`;

  initSearch();
  initCollection();
  initExport();
  initDiscogs(me);

  document.querySelector('header nav').addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  store.subscribe(({ type }) => {
    byId('nav-count').textContent = store.all().length;
    if (type === 'reloaded') showBanner('Your collection changed elsewhere — reloaded the latest version.', { timeoutMs: 6000 });
    if (type === 'save-failed') showBanner('Couldn\'t save your collection. CR8 will retry on your next change.', { error: true });
  });

  try {
    const { recovered } = await store.load();
    if (recovered) showBanner('Your collection file was damaged — restored it from the last backup.', { timeoutMs: 10000 });
  } catch (e) {
    showBanner(`Couldn't load your collection: ${esc(e.message)}`, { error: true });
  }

  window.addEventListener('cr8:throttled', e => countdown(e.detail.retryAfter));
  window.addEventListener('cr8:api-error', e => {
    if (e.detail.code === ErrorCodes.DISCOGS_TOKEN_INVALID) {
      showBanner('Discogs rejected your token. It may have been regenerated.', {
        error: true,
        actionLabel: 'Rotate token',
        action: () => { switchTab('discogs'); openRotate(); hideBanner(); },
      });
    }
  });
  window.addEventListener('cr8:token-rotated', hideBanner);

  // Save pending edits before the app quits or the page goes away.
  window.cr8Desktop?.onFlushRequest(() => store.flush());
  window.addEventListener('pagehide', () => { store.flush({ keepalive: true }); });
  window.cr8Desktop?.onUpdateReady(() => showBanner('A new version of CR8 is ready.', {
    actionLabel: 'Restart to update', action: () => window.cr8Desktop.restartToUpdate(),
  }));
}

init().catch(e => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div class="app-banner error"><div>CR8 couldn't start: ${esc(e.message)}</div></div>`);
});
