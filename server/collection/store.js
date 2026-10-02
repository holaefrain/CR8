import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../middleware/errors.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

export const SCHEMA_VERSION = 1;
export const MAX_TRACKS = 20_000;
const MAX_FIELD = 500;
const TEXT_FIELDS = ['artist', 'album', 'title', 'year', 'genre', 'label', 'duration', 'position', 'bpm', 'key', 'addedAt'];

const emptyDoc = () => ({ schemaVersion: SCHEMA_VERSION, revision: 0, updatedAt: null, tracks: [] });

// Whitelists and normalises one track. Throws on anything malformed, so a
// bad import or a corrupt file can't smuggle in unexpected data.
export function sanitizeTrack(t) {
  if (!t || typeof t !== 'object') throw new Error('track is not an object');
  const id = String(t.id || '');
  if (!/^[\w-]{1,64}$/.test(id)) throw new Error('track id is invalid');
  const out = { id };
  for (const f of TEXT_FIELDS) {
    const v = t[f] ?? '';
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`${f} is invalid`);
    out[f] = String(v).slice(0, MAX_FIELD);
  }
  const discogsId = Number(t.discogsId) || 0;
  out.discogsId = Number.isInteger(discogsId) && discogsId > 0 ? discogsId : 0;
  return out;
}

export function validateTracks(tracks) {
  if (!Array.isArray(tracks)) throw new Error('tracks must be a list');
  if (tracks.length > MAX_TRACKS) throw new Error(`at most ${MAX_TRACKS} tracks`);
  const ids = new Set();
  return tracks.map(t => {
    const clean = sanitizeTrack(t);
    if (ids.has(clean.id)) throw new Error('duplicate track id');
    ids.add(clean.id);
    return clean;
  });
}

function parseDoc(text) {
  const doc = JSON.parse(text);
  if (doc?.schemaVersion !== SCHEMA_VERSION) throw new Error('unknown schema version');
  if (!Number.isInteger(doc.revision) || doc.revision < 0) throw new Error('bad revision');
  return { ...emptyDoc(), revision: doc.revision, updatedAt: doc.updatedAt || null, tracks: validateTracks(doc.tracks) };
}

// The local collection, persisted as JSON in the app's data directory.
// Writes are atomic (temp file + rename) and the previous good file is kept
// as collection.bak.json, so a crash mid-write can never lose the collection.
export function createCollectionStore({ dataDir, log = console }) {
  const file = path.join(dataDir, 'collection.json');
  const backup = path.join(dataDir, 'collection.bak.json');
  let current = null;
  let chain = Promise.resolve(); // serialises saves

  async function readDoc(p) {
    return parseDoc(await fs.readFile(p, 'utf8'));
  }

  async function load() {
    if (current) return { ...current, recovered: false };
    try {
      current = await readDoc(file);
      return { ...current, recovered: false };
    } catch (e) {
      if (e.code === 'ENOENT') {
        current = emptyDoc();
        return { ...current, recovered: false };
      }
      log.warn?.(`[Collection] ${file} unreadable (${e.message}); trying backup`);
      // Keep the damaged file for manual recovery rather than overwriting it.
      await fs.rename(file, path.join(dataDir, `collection.corrupt-${Date.now()}.json`)).catch(() => {});
      try {
        current = await readDoc(backup);
        return { ...current, recovered: true };
      } catch {
        current = emptyDoc();
        return { ...current, recovered: true };
      }
    }
  }

  async function writeAtomic(doc) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const handle = await fs.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(JSON.stringify(doc));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.copyFile(file, backup).catch(e => { if (e.code !== 'ENOENT') throw e; });
    await fs.rename(tmp, file);
  }

  function save(tracks, baseRevision) {
    const run = chain.then(async () => {
      if (!current) await load();
      if (baseRevision !== current.revision) {
        throw new AppError(ErrorCodes.COLLECTION_CONFLICT, 409,
          'Your collection changed elsewhere. Reloaded the latest version.', { revision: current.revision });
      }
      let clean;
      try {
        clean = validateTracks(tracks);
      } catch (e) {
        throw new AppError(ErrorCodes.VALIDATION, 400, `Collection is not valid: ${e.message}.`);
      }
      const next = { schemaVersion: SCHEMA_VERSION, revision: current.revision + 1, updatedAt: new Date().toISOString(), tracks: clean };
      await writeAtomic(next);
      current = next;
      return { revision: next.revision };
    });
    chain = run.catch(() => {});
    return run;
  }

  return { load, save };
}
