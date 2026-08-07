let collection = [];
let serverHasToken = false;

// ── Camelot wheel ────────────────────────────────────────
const CAMELOT = [
  ['1A','Ab minor'],['1B','B major'],
  ['2A','Eb minor'],['2B','Gb major'],
  ['3A','Bb minor'],['3B','Db major'],
  ['4A','F minor'], ['4B','Ab major'],
  ['5A','C minor'], ['5B','Eb major'],
  ['6A','G minor'], ['6B','Bb major'],
  ['7A','D minor'], ['7B','F major'],
  ['8A','A minor'], ['8B','C major'],
  ['9A','E minor'], ['9B','G major'],
  ['10A','B minor'],['10B','D major'],
  ['11A','F# minor'],['11B','A major'],
  ['12A','C# minor'],['12B','E major'],
];

// Inject datalist once so all key inputs share it
const dl = document.createElement('datalist');
dl.id = 'camelot-list';
dl.innerHTML = CAMELOT.map(([code, name]) =>
  `<option value="${code} — ${name}">${code} — ${name}</option>`
  + `<option value="${name}">${name}</option>`
).join('');
document.head.appendChild(dl);

// ── Config load ──────────────────────────────────────────
(async () => {
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    serverHasToken = !!cfg.hasDiscogsToken;
    if (cfg.discogsUsername) {
      const el = document.getElementById('discogs-username');
      if (el && !el.value) el.value = cfg.discogsUsername;
    }
    if (serverHasToken) {
      // Hide the token input rows since the server has the token
      document.querySelectorAll('.field-row').forEach(row => {
        if (row.querySelector('#search-token, #discogs-token')) row.style.display = 'none';
      });
    }
  } catch {}
})();

// ── Token helpers ────────────────────────────────────────
// Sync the search tab token with the discogs tab token so
// the user only needs to enter it once.
function getToken() {
  return document.getElementById('search-token').value.trim()
      || document.getElementById('discogs-token').value.trim();
}

document.getElementById('search-token').addEventListener('input', () => {
  const v = document.getElementById('search-token').value;
  if (v) document.getElementById('discogs-token').value = v;
});
document.getElementById('discogs-token').addEventListener('input', () => {
  const v = document.getElementById('discogs-token').value;
  if (v) document.getElementById('search-token').value = v;
});

// ── Navigation ──────────────────────────────────────────
function switchTab(t) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('tab-' + t).classList.add('active');
  if (t === 'export') { updateLabelSettings(); detectDymoPrinter(); }
  if (t === 'collection') renderCollection();
  if (t === 'discogs' && !discogsConnected) {
    const hasUser = document.getElementById('discogs-username').value.trim();
    if ((serverHasToken || getToken()) && hasUser) connectDiscogs();
  }
}

function updateCount() {
  document.getElementById('nav-count').textContent = collection.length;
}

// ── Search ───────────────────────────────────────────────
document.getElementById('search-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

function toggleFilters() {
  document.getElementById('filter-panel').classList.toggle('open');
}

function clearFilters() {
  ['f-artist','f-label','f-country','f-year','f-genre'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-per-page').value = '10';
}

async function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const token = getToken();
  const notice = document.getElementById('search-token-notice');
  if (!token && !serverHasToken) {
    notice.classList.add('visible');
    return;
  }
  notice.classList.remove('visible');

  const filters = {
    artist:  document.getElementById('f-artist').value.trim(),
    label:   document.getElementById('f-label').value.trim(),
    country: document.getElementById('f-country').value.trim(),
    year:    document.getElementById('f-year').value.trim(),
    genre:   document.getElementById('f-genre').value.trim()
  };
  const perPage = document.getElementById('f-per-page').value;

  const btn = document.getElementById('search-btn');
  const status = document.getElementById('search-status');
  btn.disabled = true;
  status.className = 'status-line loading';
  status.textContent = 'Searching Discogs…';
  document.getElementById('results-area').innerHTML = '';

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, token, filters, perPage })
    });
    const results = await res.json();
    if (results.error) throw new Error(results.error);
    status.className = 'status-line';
    status.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found on Discogs`;
    renderResults(results);
  } catch (e) {
    status.className = 'status-line';
    status.textContent = 'Error: ' + e.message;
  }
  btn.disabled = false;
}

function renderResults(results) {
  const area = document.getElementById('results-area');
  area.innerHTML = '';
  if (!results.length) {
    area.innerHTML = '<div class="empty-state"><span class="big">♪</span>No vinyl releases found. Try a different search.</div>';
    return;
  }
  results.forEach(r => {
    const trackList = (r.tracks || []).slice(0, 6).map(t => t.position ? `${t.position}. ${t.title}` : t.title).join(' · ');
    const card = document.createElement('div');
    card.className = 'result-card';
    const thumbHtml = r.thumb
      ? `<img class="rc-thumb" src="${esc(r.thumb)}" alt="" loading="lazy" />`
      : `<div class="rc-thumb-placeholder">♪</div>`;
    card.innerHTML = `
      <div class="rc-left">
        ${thumbHtml}
        <div class="rc-info">
          <div class="rc-title">${esc(r.artist)} — ${esc(r.album)} <span style="font-weight:300;color:var(--muted)">(${r.year || '—'})</span></div>
          <div class="rc-meta">${esc(r.genre || '')}${r.label ? ' · ' + esc(r.label) : ''}</div>
          <div class="rc-tracks">${esc(trackList) || '<span style="color:var(--muted)">No tracklist available</span>'}</div>
        </div>
      </div>
      <div class="rc-right">
        ${r.discogsUrl ? `<a class="rc-discogs-link" href="${esc(r.discogsUrl)}" target="_blank" onclick="event.stopPropagation()">↗ Discogs</a>` : ''}
        <span class="tag" id="tag-${btoa(r.artist+r.album).slice(0,8)}">+ Add</span>
      </div>`;
    card.onclick = () => addAlbum(r, card);
    area.appendChild(card);
  });
}

function addAlbum(r, card) {
  if (card.classList.contains('added')) return;

  const tag = card.querySelector('.tag');
  tag.textContent = '⟳ Enriching…';
  tag.className = 'tag enriching';
  card.classList.add('added');
  card.onclick = null;

  const startIndex = collection.length;

  if (r.tracks && r.tracks.length) {
    r.tracks.forEach(t => {
      collection.push({
        artist: r.artist || '',
        album: r.album || '',
        title: t.title || '',
        year: r.year || '',
        genre: r.genre || '',
        label: r.label || '',
        duration: t.duration || '',
        position: t.position || '',
        bpm: '',
        key: '',
        discogsId: r.discogsId || '',
        _enriching: true
      });
    });
  } else {
    collection.push({
      artist: r.artist || '',
      album: r.album || '',
      title: '—',
      year: r.year || '',
      genre: r.genre || '',
      label: r.label || '',
      duration: '',
      position: '',
      bpm: '',
      key: '',
      discogsId: r.discogsId || '',
      _enriching: true
    });
  }

  updateCount();

  // Kick off Claude enrichment in background
  enrichAlbum(r, startIndex, tag);
}

async function enrichAlbum(r, startIndex, tagEl) {
  const tracks = r.tracks && r.tracks.length
    ? r.tracks
    : [{ title: r.album }];

  try {
    const res = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: r.artist, album: r.album, tracks, videos: r.videos || [] })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    (data.tracks || []).forEach((enriched, i) => {
      const idx = startIndex + i;
      if (collection[idx]) {
        collection[idx].bpm = enriched.bpm || '';
        collection[idx].key = enriched.key || '';
        collection[idx]._enriching = false;
      }
    });

    tagEl.textContent = '✓ Added';
    tagEl.className = 'tag added';

    // Refresh collection table if it's visible
    if (document.getElementById('tab-collection').classList.contains('active')) {
      renderCollection();
    }
  } catch (e) {
    console.warn('Enrichment failed:', e.message);
    // Mark tracks as no longer enriching even on failure
    for (let i = startIndex; i < startIndex + tracks.length; i++) {
      if (collection[i]) collection[i]._enriching = false;
    }
    tagEl.textContent = '✓ Added';
    tagEl.className = 'tag added';
    if (document.getElementById('tab-collection').classList.contains('active')) {
      renderCollection();
    }
  }
}

// ── Collection ───────────────────────────────────────────
function renderCollection() {
  const area = document.getElementById('collection-area');
  if (!collection.length) {
    area.innerHTML = '<div class="empty-state"><span class="big">♪</span>No tracks yet. Search and add some records.</div>';
    return;
  }
  const rows = collection.map((t, i) => {
    const bpmCell = t._enriching
      ? `<td class="enriching-cell">…</td>`
      : `<td><input class="inline-num" type="number" min="1" max="999" placeholder="BPM" value="${t.bpm || ''}" oninput="collection[${i}].bpm=this.value" /></td>`;
    const keyCell = t._enriching
      ? `<td class="enriching-cell">…</td>`
      : `<td><input class="inline-key" type="text" list="camelot-list" placeholder="Key" value="${esc(t.key || '')}" oninput="collection[${i}].key=this.value" /></td>`;
    return `
    <tr>
      <td title="${esc(t.artist)}">${esc(t.artist)}</td>
      <td title="${esc(t.album)}">${esc(t.album)}</td>
      <td title="${esc(t.title)}">${esc(t.title)}</td>
      <td>${t.year}</td>
      <td>${esc(t.genre)}</td>
      <td title="${esc(t.label)}">${esc(t.label)}</td>
      <td><input class="inline-pos" type="text" placeholder="Pos" value="${esc(t.position || '')}" oninput="collection[${i}].position=this.value" /></td>
      <td><input class="inline-dur" type="text" placeholder="0:00" value="${esc(t.duration || '')}" oninput="collection[${i}].duration=this.value" /></td>
      ${bpmCell}
      ${keyCell}
      <td><button class="del-btn" onclick="removeTrack(${i})">×</button></td>
    </tr>`;
  }).join('');
  area.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr>
          <th style="width:120px">Artist<span class="col-resize"></span></th>
          <th style="width:140px">Album<span class="col-resize"></span></th>
          <th style="width:140px">Track<span class="col-resize"></span></th>
          <th style="width:48px">Year<span class="col-resize"></span></th>
          <th style="width:100px">Genre<span class="col-resize"></span></th>
          <th style="width:100px">Label<span class="col-resize"></span></th>
          <th style="width:44px">Pos<span class="col-resize"></span></th>
          <th style="width:64px">Duration<span class="col-resize"></span></th>
          <th style="width:54px">BPM<span class="col-resize"></span></th>
          <th style="width:160px">Key<span class="col-resize"></span></th>
          <th style="width:32px"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="btn-row">
      <button class="btn danger" onclick="clearAll()">Clear all</button>
    </div>`;
  initColResize();
}

function removeTrack(i) { collection.splice(i, 1); updateCount(); renderCollection(); }
function clearAll() { if (confirm('Clear all tracks?')) { collection = []; updateCount(); renderCollection(); } }

// ── Column resize ─────────────────────────────────────────
function initColResize() {
  document.querySelectorAll('thead th .col-resize').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      const th = handle.parentElement;
      const startX = e.pageX;
      const startW = th.offsetWidth;
      handle.classList.add('dragging');
      const onMove = ev => { th.style.width = Math.max(40, startW + ev.pageX - startX) + 'px'; };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  });
}

// ── Export ───────────────────────────────────────────────
const SCALE = 2.4; // px per mm for preview

function getLabelDimensions() {
  const size = document.getElementById('dymo-size')?.value || '54x101';
  if (size === 'custom') {
    const w = parseFloat(document.getElementById('custom-w')?.value) || 54;
    const h = parseFloat(document.getElementById('custom-h')?.value) || 101;
    return { w, h };
  }
  const [w, h] = size.split('x').map(Number);
  return { w, h };
}

function updateLabelSettings() {
  const size = document.getElementById('dymo-size')?.value;
  document.getElementById('custom-size-row').style.display = size === 'custom' ? '' : 'none';
  const model = document.getElementById('dymo-model')?.value || 'LabelWriter 450';
  const { w, h } = getLabelDimensions();
  const sizeLabel = document.getElementById('dymo-size');
  const sizeText = sizeLabel?.options[sizeLabel.selectedIndex]?.text || '';
  document.getElementById('preview-label-text').textContent =
    `Label preview — DYMO ${model} · ${sizeText || `${w} × ${h} mm`}`;
  renderExport();
}

function renderExport() {
  const prev = document.getElementById('label-preview');
  if (!collection.length) { prev.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">Add tracks to see label preview</div>'; return; }

  // Group tracks by album
  const albums = [];
  const seen = new Map();
  for (const t of collection) {
    const key = t.artist + '||' + t.album;
    if (!seen.has(key)) { seen.set(key, []); albums.push({ info: t, tracks: seen.get(key) }); }
    seen.get(key).push(t);
  }

  const { w, h } = getLabelDimensions();
  const { maxTracks, showMeta } = getLabelLayout(w, h);
  const pw = Math.round(w * SCALE), ph = Math.round(h * SCALE);
  const baseFontScale = Math.min(w, h) / 54;

  const labels = albums.flatMap(({ info: a, tracks }) => {
    const chunks = [];
    for (let i = 0; i < tracks.length; i += maxTracks) {
      chunks.push(tracks.slice(i, i + maxTracks));
    }
    return chunks.map((chunk, ci) => `
      <div class="dymo-label" style="width:${pw}px;height:${ph}px;padding:${Math.round(ph*0.05)}px ${Math.round(pw*0.07)}px">
        <div class="dl-artist" style="font-size:${Math.round(13*baseFontScale)}px">${esc(a.artist)}</div>
        <div class="dl-album">${esc(a.album)}${chunks.length > 1 ? ` <span style="font-weight:300">(${ci + 1}/${chunks.length})</span>` : ''}</div>
        <div class="dl-divider"></div>
        <div class="dl-tracklist">
          ${chunk.map(t => {
            const meta = [t.bpm ? `${t.bpm} BPM` : '', t.key || '', t.duration || ''].filter(Boolean).join(' · ');
            return `<div class="dl-track-row">
              <div class="dl-track-title">
                ${t.position ? `<span class="dl-pos">${esc(t.position)}</span>` : ''}
                <span class="dl-track">${esc(t.title)}</span>
              </div>
              ${showMeta && meta ? `<div class="dl-track-meta">${esc(meta)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="dl-divider"></div>
        <div class="dl-meta">
          <span>${a.year}${a.genre ? ' · ' + esc(a.genre) : ''}</span>
          <span>${esc(a.label)}</span>
        </div>
      </div>`);
  });

  prev.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center">${labels.join('')}</div>`;
}

async function exportXLSX() {
  if (!collection.length) return alert('No tracks to export.');
  if (!window.ExcelJS) return alert('Excel export library failed to load. Please refresh the page and try again.');

  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = 'Vinyl Manager';
  workbook.lastModifiedBy = 'Vinyl Manager';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Vinyl Collection');
  worksheet.columns = [
    { header: 'Artist', key: 'artist', width: 22 },
    { header: 'Album', key: 'album', width: 26 },
    { header: 'Track Title', key: 'title', width: 32 },
    { header: 'Year', key: 'year', width: 7 },
    { header: 'Genre', key: 'genre', width: 14 },
    { header: 'Label', key: 'label', width: 22 },
    { header: 'Position', key: 'position', width: 7 },
    { header: 'Duration', key: 'duration', width: 10 },
    { header: 'BPM', key: 'bpm', width: 7 },
    { header: 'Key', key: 'key', width: 12 }
  ];

  worksheet.addRows(collection.map(t => ({
    artist: t.artist,
    album: t.album,
    title: t.title,
    year: t.year,
    genre: t.genre,
    label: t.label,
    position: t.position,
    duration: t.duration,
    bpm: t.bpm,
    key: t.key
  })));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'vinyl_collection.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportDYMO() {
  if (!collection.length) return alert('No tracks to export.');
  const headers = ['Artist', 'Album', 'Track Title', 'Year', 'Genre', 'Label', 'Position', 'Duration', 'BPM', 'Key'];
  const rows = collection.map(t =>
    [t.artist, t.album, t.title, t.year, t.genre, t.label, t.position, t.duration, t.bpm, t.key]
      .map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','));
  const blob = new Blob([[headers.join(','), ...rows].join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dymo_vinyl_labels.csv'; a.click();
}

// ── Discogs wantlist & collection ────────────────────────
let discogsConnected = false;
let wantlistPage = 1;
let wantlistPages = 1;
let collectionPage = 1;
let collectionPages = 1;

async function connectDiscogs() {
  const username = document.getElementById('discogs-username').value.trim();
  const token = getToken();
  const statusEl = document.getElementById('dsc-connect-status');
  if (!username) { statusEl.textContent = 'Enter your Discogs username.'; return; }
  if (!token && !serverHasToken) { statusEl.textContent = 'Enter your Discogs personal access token.'; return; }
  statusEl.textContent = 'Connecting…';
  try {
    const res = await fetch('/api/discogs/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, token })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    discogsConnected = true;

    const card = document.getElementById('dsc-user-card');
    const avatarHtml = data.avatar_url
      ? `<img class="discogs-avatar" src="${esc(data.avatar_url)}" alt="" style="font-size:0" />`
      : `<div class="discogs-avatar">♪</div>`;
    card.innerHTML = `
      ${avatarHtml}
      <div>
        <div class="discogs-user-name">${esc(data.name || data.username)}</div>
        <div class="discogs-user-stats">@${esc(data.username)} · ${data.num_collection.toLocaleString()} in collection · ${data.num_wantlist.toLocaleString()} in wantlist</div>
      </div>`;

    document.getElementById('dsc-auth').style.display = 'none';
    document.getElementById('dsc-connected').style.display = '';
    loadWantlist(1);
    loadDiscogsCollection(1);
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function disconnectDiscogs() {
  discogsConnected = false;
  document.getElementById('dsc-auth').style.display = '';
  document.getElementById('dsc-connected').style.display = 'none';
  document.getElementById('dsc-connect-status').textContent = '';
  document.getElementById('wantlist-area').innerHTML = '';
  document.getElementById('wantlist-pagination').innerHTML = '';
  document.getElementById('wantlist-status').textContent = '';
  document.getElementById('discogs-collection-area').innerHTML = '';
  document.getElementById('discogs-collection-pagination').innerHTML = '';
  document.getElementById('discogs-collection-status').textContent = '';
}

async function loadWantlist(page) {
  const username = document.getElementById('discogs-username').value.trim();
  const token = getToken();
  const statusEl = document.getElementById('wantlist-status');
  const area = document.getElementById('wantlist-area');
  statusEl.className = 'status-line loading';
  statusEl.textContent = `Loading wantlist${page > 1 ? ` — page ${page}` : ''}`;
  area.innerHTML = '';
  document.getElementById('wantlist-pagination').innerHTML = '';

  try {
    const params = new URLSearchParams({ username, token: token || '', page, perPage: 25 });
    const res = await fetch(`/api/discogs/wantlist?${params}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    wantlistPage = data.pagination.page;
    wantlistPages = data.pagination.pages;
    statusEl.className = 'status-line';
    statusEl.textContent = `${data.pagination.items.toLocaleString()} item${data.pagination.items !== 1 ? 's' : ''} in wantlist`;
    renderWantlist(data.items);
    renderWantlistPagination(data.pagination);
  } catch (e) {
    statusEl.className = 'status-line';
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function renderWantlist(items) {
  const area = document.getElementById('wantlist-area');
  if (!items.length) {
    area.innerHTML = '<div class="empty-state"><span class="big">♪</span>Your wantlist is empty.</div>';
    return;
  }
  items.forEach(item => {
    const alreadyAdded = collection.some(t => String(t.discogsId) === String(item.discogsId));
    const card = document.createElement('div');
    card.className = 'result-card' + (alreadyAdded ? ' added' : '');
    const thumbHtml = item.thumb
      ? `<img class="rc-thumb" src="${esc(item.thumb)}" alt="" loading="lazy" />`
      : `<div class="rc-thumb-placeholder">♪</div>`;
    const genre = item.styles || item.genre;
    card.innerHTML = `
      <div class="rc-left">
        ${thumbHtml}
        <div class="rc-info">
          <div class="rc-title">${esc(item.artist)} — ${esc(item.album)} <span style="font-weight:300;color:var(--muted)">(${item.year || '—'})</span></div>
          <div class="rc-meta">${esc(genre || '')}${item.label ? ' · ' + esc(item.label) : ''}</div>
          <div class="rc-tracks">${esc(item.formats || '')}</div>
        </div>
      </div>
      <div class="rc-right">
        ${item.discogsUrl ? `<a class="rc-discogs-link" href="${esc(item.discogsUrl)}" target="_blank" onclick="event.stopPropagation()">↗ Discogs</a>` : ''}
        <span class="tag${alreadyAdded ? ' added' : ''}" id="wtag-${item.discogsId}">${alreadyAdded ? '✓ Added' : '+ Add'}</span>
      </div>`;
    if (!alreadyAdded) card.onclick = () => addFromWantlist(item, card);
    area.appendChild(card);
  });
}

function renderWantlistPagination(pagination) {
  const el = document.getElementById('wantlist-pagination');
  if (pagination.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn" ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadWantlist(${pagination.page - 1})">← Prev</button>
    <span style="font-size:12px;color:var(--cream-dim)">${pagination.page} / ${pagination.pages}</span>
    <button class="btn" ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="loadWantlist(${pagination.page + 1})">Next →</button>`;
}

async function loadDiscogsCollection(page) {
  const username = document.getElementById('discogs-username').value.trim();
  const token = getToken();
  const statusEl = document.getElementById('discogs-collection-status');
  const area = document.getElementById('discogs-collection-area');
  statusEl.className = 'status-line loading';
  statusEl.textContent = `Loading collection${page > 1 ? ` — page ${page}` : ''}`;
  area.innerHTML = '';
  document.getElementById('discogs-collection-pagination').innerHTML = '';

  try {
    const params = new URLSearchParams({ username, token: token || '', page, perPage: 25 });
    const res = await fetch(`/api/discogs/collection?${params}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    collectionPage = data.pagination.page;
    collectionPages = data.pagination.pages;
    statusEl.className = 'status-line';
    statusEl.textContent = `${data.pagination.items.toLocaleString()} item${data.pagination.items !== 1 ? 's' : ''} in collection`;
    renderDiscogsCollection(data.items);
    renderCollectionPagination(data.pagination);
  } catch (e) {
    statusEl.className = 'status-line';
    statusEl.textContent = 'Error: ' + e.message;
  }
}

function renderDiscogsCollection(items) {
  const area = document.getElementById('discogs-collection-area');
  if (!items.length) {
    area.innerHTML = '<div class="empty-state"><span class="big">♪</span>Your collection is empty.</div>';
    return;
  }
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'result-card';
    const thumbHtml = item.thumb
      ? `<img class="rc-thumb" src="${esc(item.thumb)}" alt="" loading="lazy" />`
      : `<div class="rc-thumb-placeholder">♪</div>`;
    const genre = item.styles || item.genre;
    card.innerHTML = `
      <div class="rc-left">
        ${thumbHtml}
        <div class="rc-info">
          <div class="rc-title">${esc(item.artist)} — ${esc(item.album)} <span style="font-weight:300;color:var(--muted)">(${item.year || '—'})</span></div>
          <div class="rc-meta">${esc(genre || '')}${item.label ? ' · ' + esc(item.label) : ''}</div>
          <div class="rc-tracks">${esc(item.formats || '')}</div>
        </div>
      </div>
      <div class="rc-right">
        ${item.discogsUrl ? `<a class="rc-discogs-link" href="${esc(item.discogsUrl)}" target="_blank" onclick="event.stopPropagation()">↗ Discogs</a>` : ''}
      </div>`;
    area.appendChild(card);
  });
}

function renderCollectionPagination(pagination) {
  const el = document.getElementById('discogs-collection-pagination');
  if (pagination.pages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button class="btn" ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadDiscogsCollection(${pagination.page - 1})">← Prev</button>
    <span style="font-size:12px;color:var(--cream-dim)">${pagination.page} / ${pagination.pages}</span>
    <button class="btn" ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="loadDiscogsCollection(${pagination.page + 1})">Next →</button>`;
}

async function addFromWantlist(item, card) {
  if (card.classList.contains('added')) return;
  const tag = document.getElementById('wtag-' + item.discogsId);
  tag.textContent = '⟳ Fetching…';
  tag.className = 'tag enriching';
  card.onclick = null;
  try {
    const token = getToken();
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const res = await fetch(`/api/discogs/release/${item.discogsId}${params}`);
    const detail = await res.json();
    if (detail.error) throw new Error(detail.error);
    addAlbum({
      artist: item.artist,
      album: item.album,
      year: item.year,
      genre: item.styles || item.genre,
      label: item.label,
      tracks: detail.tracks,
      discogsId: item.discogsId,
      discogsUrl: item.discogsUrl,
      thumb: item.thumb,
      videos: detail.videos
    }, card);
  } catch (e) {
    tag.textContent = '+ Add';
    tag.className = 'tag';
    card.onclick = () => addFromWantlist(item, card);
    console.warn('Failed to add from wantlist:', e.message);
  }
}

// ── Discogs export ────────────────────────────────────────
async function exportToDiscogs(mode) {
  if (!collection.length) return alert('No tracks to export.');
  const username = document.getElementById('discogs-username').value.trim();
  const token = getToken();
  if (!username) return alert('Please enter your Discogs username.');
  if (!token && !serverHasToken) return alert('Please enter your Discogs token.');

  const status = document.getElementById('discogs-status');
  const resultsList = document.getElementById('discogs-results');
  status.className = 'status-line loading';
  status.textContent = 'Exporting to Discogs';
  resultsList.innerHTML = '';

  const albums = [...new Map(collection.map(t => [t.artist + t.album, t])).values()];
  albums.forEach(a => {
    const row = document.createElement('div');
    row.className = 'result-row';
    row.id = 'dr-' + btoa(a.artist + a.album).slice(0, 10);
    row.innerHTML = `<span>${esc(a.artist)} — ${esc(a.album)}</span><span class="pill searching">searching…</span>`;
    resultsList.appendChild(row);
  });

  try {
    const res = await fetch('/api/discogs/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, username, token, mode })
    });
    const data = await res.json();
    status.className = 'status-line';
    const added = (data.results || []).filter(r => r.status === 'added').length;
    status.textContent = `Done — ${added} of ${albums.length} album${albums.length !== 1 ? 's' : ''} added to Discogs ${mode}.`;
    (data.results || []).forEach(r => {
      resultsList.querySelectorAll('.result-row').forEach(row => {
        const albumText = row.querySelector('span')?.textContent || '';
        if (albumText.includes(r.album.split(' - ')[1]?.trim() || '')) {
          const pill = row.querySelector('.pill');
          const labels = { added: 'added', failed: 'failed', not_found: 'not found', error: 'error' };
          pill.className = 'pill ' + (r.status === 'added' ? 'added' : 'failed');
          pill.textContent = labels[r.status] || r.status;
        }
      });
    });
  } catch (e) {
    status.className = 'status-line';
    status.textContent = 'Error: ' + e.message;
  }
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── DYMO direct printing ─────────────────────────────────
let dymoReady = false;
let detectedPrinter = null;

async function detectDymoPrinter() {
  const statusEl = document.getElementById('dymo-printer-status');
  const printBtn = document.getElementById('btn-dymo-print');
  dymoReady = false;
  detectedPrinter = null;
  printBtn.disabled = true;

  if (typeof dymo === 'undefined' || !dymo?.label?.framework) {
    statusEl.innerHTML = 'DYMO Connect not installed — <a href="https://www.dymo.com/software.html" target="_blank" style="color:var(--amber)">download here</a>';
    return;
  }

  statusEl.innerHTML = '<span style="color:var(--amber)">detecting…</span>';

  try {
    const initResult = dymo.label.framework.init();
    if (initResult && typeof initResult.then === 'function') await initResult;
  } catch {
    statusEl.textContent = 'DYMO Connect not running — open DYMO Connect first';
    return;
  }

  try {
    const printers = dymo.label.framework.getPrinters();
    const labelWriters = printers.filter(p => p.printerType === 'LabelWriterPrinter');

    if (!labelWriters.length) {
      statusEl.textContent = 'No LabelWriter connected';
      return;
    }

    detectedPrinter = labelWriters[0];
    dymoReady = true;

    // Match detected model to dropdown
    const modelSelect = document.getElementById('dymo-model');
    const detected = (detectedPrinter.modelName || detectedPrinter.name || '').toLowerCase();
    const modelMap = [
      ['550 turbo', 'LabelWriter 550 Turbo'],
      ['550',       'LabelWriter 550'],
      ['450 turbo', 'LabelWriter 450 Turbo'],
      ['4xl',       'LabelWriter 4XL'],
      ['wireless',  'LabelWriter Wireless'],
      ['450',       'LabelWriter 450'],
    ];
    for (const [fragment, optText] of modelMap) {
      if (detected.includes(fragment)) {
        for (const opt of modelSelect.options) {
          if (opt.text === optText) { modelSelect.value = opt.value; break; }
        }
        break;
      }
    }

    // LabelWriter 550 series: attempt to read installed roll
    if (detected.includes('550')) {
      try {
        const info = dymo.label.framework.getPrinterInfo(detectedPrinter.name);
        const labelName = info?.installedLabel?.name || '';
        const partMap = { '30252': '28x89', '30323': '54x101', '30257': '54x54', '30336': '25x54', '30332': '19x51', '30370': '57x101' };
        for (const [part, val] of Object.entries(partMap)) {
          if (labelName.includes(part)) {
            document.getElementById('dymo-size').value = val;
            break;
          }
        }
        if (labelName) {
          statusEl.innerHTML = `<span style="color:var(--green)">●</span> ${esc(detectedPrinter.name)} · ${esc(labelName)}`;
          updateLabelSettings();
          printBtn.disabled = false;
          return;
        }
      } catch {}
    }

    updateLabelSettings();
    statusEl.innerHTML = `<span style="color:var(--green)">●</span> ${esc(detectedPrinter.name)} — ready`;
    printBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = 'Could not query printers: ' + e.message;
  }
}

function getPaperName(wMm, hMm) {
  const names = {
    '54x101': '30323 Large Address',
    '28x89':  '30252 Address',
    '54x54':  '30257 Large Multipurpose',
    '25x54':  '30336 Small Multipurpose',
    '19x51':  '30332 Small Address',
    '57x101': '30370 Extra Large Address',
  };
  return names[`${wMm}x${hMm}`] || `${wMm} x ${hMm}`;
}

function getLabelLayout(wMm, hMm) {
  // Max tracks per label before splitting to a new label
  let maxTracks;
  if      (hMm >= 90 && wMm >= 50) maxTracks = 5;  // 54×101, 57×101
  else if (hMm >= 80)               maxTracks = 4;  // 28×89
  else if (hMm >= 50)               maxTracks = 3;  // 54×54
  else if (hMm >= 42)               maxTracks = 2;  // 25×54
  else                              maxTracks = 1;  // 19×51

  // Show per-track BPM/key/duration sub-line only when there's width for it
  const showMeta = wMm >= 26;

  // Print font sizes (pt) — scaled to label width
  let fonts;
  if (wMm >= 50) {
    fonts = { artist: 11, album: 9, divider: 7, title: 8, meta: 7, footer: 7 };
  } else if (wMm >= 26) {
    fonts = { artist: 9, album: 8, divider: 6, title: 7, meta: 6, footer: 6 };
  } else {
    fonts = { artist: 7, album: 6, divider: 5, title: 6, meta: 0, footer: 5 };
  }

  return { maxTracks, showMeta, fonts };
}

function buildLabelXml(info, tracks, partLabel, wMm, hMm) {
  const toTwips = mm => Math.round(mm * 56.693);
  const W = toTwips(wMm);
  const H = toTwips(hMm);
  const pad = Math.round(Math.min(W, H) * 0.05);

  const { fonts, showMeta } = getLabelLayout(wMm, hMm);
  const paperName = getPaperName(wMm, hMm);

  const xmlEsc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const elem = (text, size, bold = false, last = false) =>
    `<Element><String>${xmlEsc(text)}${last ? '' : '&#xA;'}</String>` +
    `<Attributes><Font Family="Arial" Size="${size}" Bold="${bold ? 'True' : 'False'}" ` +
    `Italic="False" Underline="False" StrikeThrough="False" />` +
    `<ForeColor Alpha="255" Red="0" Green="0" Blue="0" /></Attributes></Element>`;

  const divider = '\u2500'.repeat(wMm >= 50 ? 20 : wMm >= 26 ? 14 : 10);
  const albumLine = info.album + (partLabel ? ` ${partLabel}` : '');

  const parts = [];
  parts.push(elem(info.artist, fonts.artist, true));
  parts.push(elem(albumLine, fonts.album));
  parts.push(elem(divider, fonts.divider));

  for (const t of tracks) {
    const pos = t.position ? `${t.position}. ` : '';
    parts.push(elem(pos + t.title, fonts.title));
    if (showMeta) {
      const meta = [t.bpm ? `${t.bpm} BPM` : '', t.key || '', t.duration || ''].filter(Boolean).join(' \u00b7 ');
      if (meta) parts.push(elem(meta, fonts.meta));
    }
  }

  parts.push(elem(divider, fonts.divider));

  const yearGenre = [info.year, info.genre].filter(Boolean).join(' \u00b7 ');
  if (yearGenre && info.label) {
    parts.push(elem(yearGenre, fonts.footer));
    parts.push(elem(info.label, fonts.footer, false, true));
  } else if (yearGenre) {
    parts.push(elem(yearGenre, fonts.footer, false, true));
  } else if (info.label) {
    parts.push(elem(info.label, fonts.footer, false, true));
  }

  const styledText = `<StyledText>${parts.join('')}</StyledText>`;

  return `<?xml version="1.0" encoding="utf-8"?><DieCutLabel Version="8.0" Units="twips">` +
    `<PaperOrientation>Portrait</PaperOrientation><Id>Address</Id>` +
    `<PaperName>${paperName}</PaperName>` +
    `<DrawCommands><RoundRectangle X="0" Y="0" Width="${W}" Height="${H}" Rx="180" Ry="180" /></DrawCommands>` +
    `<ObjectInfo><TextObject><Name>LABEL</Name>` +
    `<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />` +
    `<BackColor Alpha="0" Red="255" Green="255" Blue="255" />` +
    `<LinkedObjectName></LinkedObjectName><Rotation>Rotation0</Rotation>` +
    `<IsMirrored>False</IsMirrored><IsVariable>False</IsVariable>` +
    `<HorizontalAlignment>Left</HorizontalAlignment><VerticalAlignment>Top</VerticalAlignment>` +
    `<TextFitMode>ShrinkToFit</TextFitMode><UseFullFontHeight>True</UseFullFontHeight>` +
    `<Verticalized>False</Verticalized>${styledText}</TextObject>` +
    `<ObjectLayout><DockMode>None</DockMode><Absolute>` +
    `<X>${pad}</X><Y>${pad}</Y><Width>${W - pad * 2}</Width><Height>${H - pad * 2}</Height>` +
    `</Absolute></ObjectLayout></ObjectInfo></DieCutLabel>`;
}

async function printDymoLabels() {
  if (!dymoReady || !detectedPrinter) {
    alert('No printer detected. Click \u21ba Detect first.');
    return;
  }
  if (!collection.length) { alert('No tracks to print.'); return; }

  const albums = [];
  const seen = new Map();
  for (const t of collection) {
    const key = t.artist + '||' + t.album;
    if (!seen.has(key)) { seen.set(key, []); albums.push({ info: t, tracks: seen.get(key) }); }
    seen.get(key).push(t);
  }

  const { w, h } = getLabelDimensions();
  const { maxTracks } = getLabelLayout(w, h);
  const printStatusEl = document.getElementById('dymo-print-status');
  printStatusEl.textContent = 'Printing\u2026';

  let count = 0;
  try {
    for (const { info: a, tracks } of albums) {
      const chunks = [];
      for (let i = 0; i < tracks.length; i += maxTracks) chunks.push(tracks.slice(i, i + maxTracks));
      for (let ci = 0; ci < chunks.length; ci++) {
        const partLabel = chunks.length > 1 ? `(${ci + 1}/${chunks.length})` : '';
        const xml = buildLabelXml(a, chunks[ci], partLabel, w, h);
        const label = dymo.label.framework.openLabelXml(xml);
        label.print(detectedPrinter.name);
        count++;
      }
    }
    printStatusEl.textContent = `Sent ${count} label${count !== 1 ? 's' : ''} to ${detectedPrinter.name}`;
    setTimeout(() => { printStatusEl.textContent = ''; }, 5000);
  } catch (e) {
    printStatusEl.textContent = 'Print failed: ' + e.message;
  }
}