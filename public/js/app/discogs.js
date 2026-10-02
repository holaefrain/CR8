import { api, ErrorCodes } from '../api.js';
import { esc, byId, safeUrl, setStatus, onAction } from '../dom.js';
import { mountTokenForm } from '../components/tokenForm.js';
import { renderTokenTutorial } from '../components/tokenTutorial.js';
import { releaseCardHtml, addFromCard } from './releaseCard.js';
import * as store from './collectionStore.js';

let loaded = false;
let me = null;

export function initDiscogs(profile) {
  me = profile;
  const root = byId('tab-discogs');
  onAction(root, {
    'token-rotate': toggleRotate,
    'token-remove': removeToken,
    'discogs-export': el => exportToDiscogs(el.dataset.mode),
    'page': el => loadFolder(el.dataset.folder, Number(el.dataset.page)),
  });
  for (const id of ['setting-beatport', 'setting-youtube']) byId(id).addEventListener('change', saveSettings);
  renderConnection();
}

export function onShow() {
  if (loaded) return;
  loaded = true;
  loadProfile();
  loadSettings();
  loadFolder('wantlist', 1);
  loadFolder('collection', 1);
}

// Opens the Rotate-token form (also used by the "token rejected" banner).
export function openRotate() {
  const panel = byId('dsc-rotate');
  if (!panel.hidden) return;
  panel.hidden = false;
  panel.innerHTML = '<div data-slot="tutorial"></div><div data-slot="form"></div>';
  renderTokenTutorial(panel.querySelector('[data-slot=tutorial]'), { username: me.discogsUsername, open: true });
  mountTokenForm(panel.querySelector('[data-slot=form]'), {
    submitLabel: 'Verify & save',
    onSuccess: updated => {
      me = updated;
      renderConnection();
      setTimeout(() => { panel.hidden = true; panel.innerHTML = ''; }, 900);
      window.dispatchEvent(new CustomEvent('cr8:token-rotated'));
      loaded = false;
      onShow();
    },
  }).focus();
}

function toggleRotate() {
  const panel = byId('dsc-rotate');
  if (panel.hidden) openRotate();
  else { panel.hidden = true; panel.innerHTML = ''; }
}

async function removeToken() {
  if (!confirm('Remove your Discogs token from this computer? You\'ll need to connect it again to use CR8.')) return;
  await api('/api/account/discogs-token', { method: 'DELETE' });
  location.href = '/';
}

function renderConnection() {
  const verified = me.discogs.verifiedAt ? ` · verified ${new Date(me.discogs.verifiedAt).toLocaleDateString()}` : '';
  byId('dsc-token-summary').textContent = me.discogs.connected
    ? `•••• ${me.discogs.last4}${verified}`
    : 'Not connected';
}

async function loadProfile() {
  const card = byId('dsc-user-card');
  try {
    const p = await api('/api/discogs/profile');
    const avatar = p.avatar_url
      ? `<img class="discogs-avatar" src="${safeUrl(p.avatar_url)}" alt="" />`
      : '<div class="discogs-avatar">♪</div>';
    card.innerHTML = `
      ${avatar}
      <div>
        <div class="discogs-user-name">${esc(p.name || p.username)}</div>
        <div class="discogs-user-stats">@${esc(p.username)} · ${Number(p.num_collection).toLocaleString()} in collection · ${Number(p.num_wantlist).toLocaleString()} in wantlist</div>
      </div>`;
  } catch (e) {
    card.innerHTML = `<div class="discogs-user-stats">Couldn't load your Discogs profile: ${esc(e.message)}</div>`;
  }
}

// ── Settings: enrichment sources ─────────────────────────
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    byId('setting-beatport').checked = s.beatport;
    byId('setting-youtube').checked = s.youtube;
  } catch { /* keep defaults */ }
}

async function saveSettings() {
  await api('/api/settings', {
    method: 'PUT',
    body: { beatport: byId('setting-beatport').checked, youtube: byId('setting-youtube').checked },
  }).catch(() => loadSettings());
}

// ── Wantlist & Discogs collection ────────────────────────
const FOLDERS = {
  wantlist: { label: 'wantlist', area: 'wantlist-area', status: 'wantlist-status', pager: 'wantlist-pagination', empty: 'Your wantlist is empty.', addable: true },
  collection: { label: 'collection', area: 'discogs-collection-area', status: 'discogs-collection-status', pager: 'discogs-collection-pagination', empty: 'Your collection is empty.', addable: false },
};

async function loadFolder(name, page) {
  const f = FOLDERS[name];
  const statusEl = byId(f.status);
  const area = byId(f.area);
  setStatus(statusEl, `Loading ${f.label}${page > 1 ? ` — page ${page}` : ''}`, { loading: true });
  area.innerHTML = '';
  byId(f.pager).innerHTML = '';

  try {
    const data = await api(`/api/discogs/${name}?${new URLSearchParams({ page, perPage: 25 })}`);
    const n = data.pagination.items;
    setStatus(statusEl, `${n.toLocaleString()} item${n !== 1 ? 's' : ''} in ${f.label}`);
    renderItems(name, data.items);
    renderPager(name, data.pagination);
  } catch (e) {
    setStatus(statusEl, 'Error: ' + e.message);
  }
}

function renderItems(name, items) {
  const f = FOLDERS[name];
  const area = byId(f.area);
  if (!items.length) {
    area.innerHTML = `<div class="empty-state"><span class="big">♪</span>${f.empty}</div>`;
    return;
  }
  const inCollection = new Set(store.all().map(t => String(t.discogsId)));
  for (const item of items) {
    const added = f.addable && inCollection.has(String(item.discogsId));
    const card = document.createElement('div');
    card.className = 'result-card' + (added ? ' added' : '');
    card.innerHTML = releaseCardHtml({ ...item, genre: item.styles || item.genre }, {
      meta: esc(item.formats || ''),
      tag: f.addable ? `<span class="tag${added ? ' added' : ''}">${added ? '✓ Added' : '+ Add'}</span>` : '',
    });
    if (f.addable && !added) {
      card.addEventListener('click', e => { if (!e.target.closest('a')) addFromWantlist(item, card); });
    }
    area.appendChild(card);
  }
}

function renderPager(name, p) {
  const el = byId(FOLDERS[name].pager);
  if (p.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn" data-action="page" data-folder="${name}" data-page="${p.page - 1}" ${p.page <= 1 ? 'disabled' : ''}>← Prev</button>
    <span style="font-size:12px;color:var(--cream-dim)">${p.page} / ${p.pages}</span>
    <button class="btn" data-action="page" data-folder="${name}" data-page="${p.page + 1}" ${p.page >= p.pages ? 'disabled' : ''}>Next →</button>`;
}

async function addFromWantlist(item, card) {
  if (card.classList.contains('added') || card.dataset.busy) return;
  card.dataset.busy = '1';
  const tag = card.querySelector('.tag');
  tag.textContent = '⟳ Fetching…';
  tag.className = 'tag enriching';
  try {
    const { tracks } = await api(`/api/discogs/release/${item.discogsId}`);
    await addFromCard({ ...item, genre: item.styles || item.genre, tracks }, card);
  } catch (e) {
    tag.textContent = '+ Add';
    tag.className = 'tag';
    console.warn('Failed to add from wantlist:', e.message);
  } finally {
    delete card.dataset.busy;
  }
}

// ── Export local collection to Discogs ───────────────────
async function exportToDiscogs(mode) {
  const tracks = store.all();
  if (!tracks.length) return alert('No tracks to export.');

  const status = byId('discogs-status');
  const list = byId('discogs-results');
  const albums = [...new Map(tracks.map(t => [t.artist + t.album, t])).values()];
  if (albums.length > 100) return alert('Export up to 100 albums at a time.');

  setStatus(status, 'Exporting to Discogs', { loading: true });
  list.innerHTML = albums.map(a =>
    `<div class="result-row"><span>${esc(a.artist)} — ${esc(a.album)}</span><span class="pill searching">searching…</span></div>`).join('');

  try {
    const { results } = await api('/api/discogs/export', {
      method: 'POST',
      retry: false, // adding to a Discogs collection twice creates duplicates
      body: { mode, albums: albums.map(({ artist, album, discogsId }) => ({ artist, album, discogsId })) },
    });
    const labels = { added: 'added', failed: 'failed', not_found: 'not found' };
    // Results come back in the order the albums were sent.
    list.querySelectorAll('.pill').forEach((pill, i) => {
      const r = results[i];
      if (!r) return;
      pill.className = 'pill ' + (r.status === 'added' ? 'added' : 'failed');
      pill.textContent = labels[r.status] || r.status;
    });
    const added = results.filter(r => r.status === 'added').length;
    setStatus(status, `Done — ${added} of ${albums.length} album${albums.length !== 1 ? 's' : ''} added to Discogs ${mode}.`);
  } catch (e) {
    setStatus(status, e.code === ErrorCodes.DISCOGS_THROTTLED
      ? `${e.message} Some albums may already have been added.`
      : 'Error: ' + e.message);
  }
}
