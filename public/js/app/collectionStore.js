import { api, ErrorCodes } from '../api.js';

// The single owner of the local collection. Every other module reads through
// all()/get() and changes tracks only through these methods; changes are
// saved to disk (via the local server) 400 ms after the last edit.
const SAVE_DELAY_MS = 400;
const KEEPALIVE_LIMIT = 60_000; // fetch keepalive bodies are capped at 64 KB
export const FIELDS = ['artist', 'album', 'title', 'year', 'genre', 'label', 'duration', 'position', 'bpm', 'key'];

let tracks = [];
let revision = 0;
const enriching = new Set();
const listeners = new Set();

let dirty = false;
let saveTimer = null;
let saving = null;

const emit = (type, ids = []) => listeners.forEach(fn => fn({ type, ids }));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function load() {
  const doc = await api('/api/collection');
  tracks = doc.tracks;
  revision = doc.revision;
  emit('reset');
  return { recovered: doc.recovered };
}

export const all = () => tracks;
export const get = id => tracks.find(t => t.id === id);
export const isEnriching = id => enriching.has(id);

function normalise(t) {
  const out = { id: crypto.randomUUID(), addedAt: new Date().toISOString(), discogsId: Number(t.discogsId) || 0 };
  for (const f of FIELDS) out[f] = String(t[f] ?? '');
  return out;
}

export function add(records) {
  const added = records.map(normalise);
  tracks = [...tracks, ...added];
  scheduleSave();
  emit('add', added.map(t => t.id));
  return added;
}

// `quiet` skips re-rendering — used for inline edits so the input keeps focus.
export function update(id, patch, { quiet = false } = {}) {
  const i = tracks.findIndex(t => t.id === id);
  if (i === -1) return;
  const next = { ...tracks[i] };
  for (const f of FIELDS) if (f in patch) next[f] = String(patch[f] ?? '');
  tracks = tracks.map((t, j) => (j === i ? next : t));
  scheduleSave();
  emit(quiet ? 'edit' : 'update', [id]);
}

export function remove(id) {
  tracks = tracks.filter(t => t.id !== id);
  enriching.delete(id);
  scheduleSave();
  emit('remove', [id]);
}

export function clear() {
  tracks = [];
  enriching.clear();
  scheduleSave();
  emit('reset');
}

export function setEnriching(ids, on) {
  for (const id of ids) on ? enriching.add(id) : enriching.delete(id);
  emit('update', ids);
}

// ── Backup import ────────────────────────────────────────
const dedupeKey = t => `${t.discogsId}|${t.position}|${t.title}`.toLowerCase();

export function importTracks(imported, mode) {
  const clean = imported.map(t => ({ ...normalise(t), addedAt: String(t.addedAt || new Date().toISOString()) }));
  if (mode === 'replace') {
    tracks = clean;
    enriching.clear();
  } else {
    const seen = new Set(tracks.map(dedupeKey));
    tracks = [...tracks, ...clean.filter(t => !seen.has(dedupeKey(t)) && seen.add(dedupeKey(t)))];
  }
  scheduleSave();
  emit('reset');
}

export function exportBackup() {
  return {
    app: 'CR8',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    tracks: tracks.map(({ id, ...rest }) => rest),
  };
}

// ── Persistence ──────────────────────────────────────────
function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { save(); }, SAVE_DELAY_MS);
}

async function save({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  if (saving) { await saving; if (!dirty) return; }
  if (!dirty) return;
  dirty = false;
  const snapshot = tracks;
  saving = (async () => {
    try {
      const body = { baseRevision: revision, tracks: snapshot };
      const res = await api('/api/collection', {
        method: 'PUT', body, keepalive: keepalive && JSON.stringify(body).length < KEEPALIVE_LIMIT,
      });
      revision = res.revision;
    } catch (e) {
      if (e.code === ErrorCodes.COLLECTION_CONFLICT) {
        await load();
        emit('reloaded');
      } else {
        dirty = true; // keep the change; next edit or flush retries
        emit('save-failed');
      }
    } finally {
      saving = null;
    }
  })();
  await saving;
}

// Save now (before quit / when the page is hidden).
export function flush(opts) {
  return save(opts);
}
