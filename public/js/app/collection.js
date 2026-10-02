import { esc, byId, onAction } from '../dom.js';
import * as store from './collectionStore.js';

const EDITABLE = new Set(['position', 'duration', 'bpm', 'key']);

export function initCollection() {
  const area = byId('collection-area');

  onAction(area, {
    'remove-track': el => store.remove(el.closest('tr').dataset.id),
    'clear-all': () => { if (confirm('Clear all tracks?')) store.clear(); },
    'backup-export': exportBackup,
    'backup-import': () => byId('backup-file').click(),
  });

  // Inline edits: one delegated listener, keyed by track id (not position).
  area.addEventListener('input', e => {
    const field = e.target.dataset?.field;
    const id = e.target.closest('tr')?.dataset.id;
    if (field && id && EDITABLE.has(field)) store.update(id, { [field]: e.target.value }, { quiet: true });
  });
  area.addEventListener('change', e => {
    if (e.target.id === 'backup-file') importBackup(e.target);
  });

  store.subscribe(({ type, ids }) => {
    if (!byId('tab-collection').classList.contains('active')) return;
    if (type === 'update') ids.forEach(updateRow);
    else if (type !== 'edit') render();
  });
}

function rowHtml(t) {
  const busy = store.isEnriching(t.id);
  const input = (field, cls, extra = '') =>
    `<input class="${cls}" data-field="${field}" value="${esc(t[field])}" ${extra} />`;
  return `
    <tr data-id="${esc(t.id)}">
      <td title="${esc(t.artist)}">${esc(t.artist)}</td>
      <td title="${esc(t.album)}">${esc(t.album)}</td>
      <td title="${esc(t.title)}">${esc(t.title)}</td>
      <td>${esc(t.year)}</td>
      <td>${esc(t.genre)}</td>
      <td title="${esc(t.label)}">${esc(t.label)}</td>
      <td>${input('position', 'inline-pos', 'type="text" placeholder="Pos"')}</td>
      <td>${input('duration', 'inline-dur', 'type="text" placeholder="0:00"')}</td>
      ${busy ? '<td class="enriching-cell">…</td>' : `<td>${input('bpm', 'inline-num', 'type="number" min="1" max="999" placeholder="BPM"')}</td>`}
      ${busy ? '<td class="enriching-cell">…</td>' : `<td>${input('key', 'inline-key', 'type="text" list="camelot-list" placeholder="Key"')}</td>`}
      <td><button class="del-btn" data-action="remove-track" title="Remove">×</button></td>
    </tr>`;
}

// Re-render one row in place. A full render would reset column widths and
// steal focus from whatever cell the user is editing.
function updateRow(id) {
  const tr = byId('collection-area').querySelector(`tr[data-id="${CSS.escape(id)}"]`);
  const t = store.get(id);
  if (tr && t) tr.outerHTML = rowHtml(t);
}

const BACKUP_BUTTONS = `
  <button class="btn" data-action="backup-export">Export backup (.json)</button>
  <button class="btn" data-action="backup-import">Import backup</button>
  <input type="file" id="backup-file" accept="application/json,.json" hidden />`;

export function render() {
  const area = byId('collection-area');
  const tracks = store.all();
  if (!tracks.length) {
    area.innerHTML = `<div class="empty-state"><span class="big">♪</span>No tracks yet. Search and add some records.</div>
      <div class="btn-row">${BACKUP_BUTTONS}</div>`;
    return;
  }
  area.innerHTML = `
    <div class="table-container">
      <table>
        <thead><tr>
          <th style="width:170px">Artist<span class="col-resize"></span></th>
          <th style="width:200px">Album<span class="col-resize"></span></th>
          <th style="width:240px">Track<span class="col-resize"></span></th>
          <th style="width:64px">Year<span class="col-resize"></span></th>
          <th style="width:190px">Genre<span class="col-resize"></span></th>
          <th style="width:170px">Label<span class="col-resize"></span></th>
          <th style="width:72px">Pos<span class="col-resize"></span></th>
          <th style="width:96px">Duration<span class="col-resize"></span></th>
          <th style="width:84px">BPM<span class="col-resize"></span></th>
          <th style="width:150px">Key<span class="col-resize"></span></th>
          <th style="width:48px"></th>
        </tr></thead>
        <tbody>${tracks.map(rowHtml).join('')}</tbody>
      </table>
    </div>
    <div class="btn-row">
      <button class="btn danger" data-action="clear-all">Clear all</button>
      ${BACKUP_BUTTONS}
    </div>`;
  initColResize(area);
}

// ── Column resize ─────────────────────────────────────────
function initColResize(area) {
  area.querySelectorAll('thead th .col-resize').forEach(handle => {
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

// ── Backup ───────────────────────────────────────────────
function exportBackup() {
  const blob = new Blob([JSON.stringify(store.exportBackup(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cr8-collection-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importBackup(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let tracks;
  try {
    const doc = JSON.parse(await file.text());
    if (doc?.app !== 'CR8' || !Array.isArray(doc.tracks)) throw new Error('not a CR8 backup');
    tracks = doc.tracks;
  } catch (e) {
    alert(`That file isn't a CR8 backup (${e.message}).`);
    return;
  }
  const replace = store.all().length === 0 || confirm(
    `Import ${tracks.length} tracks.\n\nOK — replace your current collection\nCancel — merge (skip duplicates)`);
  store.importTracks(tracks, replace ? 'replace' : 'merge');
}
