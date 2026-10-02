import { api } from '../api.js';
import { esc, byId, setStatus, onAction } from '../dom.js';
import { releaseCardHtml, addFromCard } from './releaseCard.js';

const FILTERS = ['f-artist', 'f-label', 'f-country', 'f-year', 'f-genre'];

export function initSearch() {
  const root = byId('tab-search');
  onAction(root, {
    'search': doSearch,
    'toggle-filters': () => byId('filter-panel').classList.toggle('open'),
    'clear-filters': () => {
      FILTERS.forEach(id => { byId(id).value = ''; });
      byId('f-per-page').value = '10';
    },
  });
  byId('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

async function doSearch() {
  const q = byId('search-input').value.trim();
  if (!q) return;

  const filters = {
    artist: byId('f-artist').value.trim(),
    label: byId('f-label').value.trim(),
    country: byId('f-country').value.trim(),
    year: byId('f-year').value.trim(),
    genre: byId('f-genre').value.trim(),
  };
  const btn = byId('search-btn');
  const status = byId('search-status');
  btn.disabled = true;
  setStatus(status, 'Searching Discogs…', { loading: true });
  byId('results-area').innerHTML = '';

  try {
    const results = await api('/api/search', {
      method: 'POST',
      body: { query: q, filters, perPage: byId('f-per-page').value },
    });
    setStatus(status, `${results.length} result${results.length !== 1 ? 's' : ''} found on Discogs`);
    renderResults(results);
  } catch (e) {
    setStatus(status, 'Error: ' + e.message);
  }
  btn.disabled = false;
}

function renderResults(results) {
  const area = byId('results-area');
  area.innerHTML = '';
  if (!results.length) {
    area.innerHTML = '<div class="empty-state"><span class="big">♪</span>No vinyl releases found. Try a different search.</div>';
    return;
  }
  for (const r of results) {
    const trackList = (r.tracks || []).slice(0, 6).map(t => (t.position ? `${t.position}. ${t.title}` : t.title)).join(' · ');
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = releaseCardHtml(r, {
      meta: esc(trackList) || '<span style="color:var(--muted)">No tracklist available</span>',
      tag: '<span class="tag">+ Add</span>',
    });
    card.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      addFromCard(r, card);
    });
    area.appendChild(card);
  }
}
