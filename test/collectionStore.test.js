import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createCollectionStore } from '../server/collection/store.js';
import { tempDir } from './helpers.js';

const track = (id, extra = {}) => ({ id, artist: 'A', album: 'B', title: 'T', bpm: '120', key: '8A', discogsId: 1, ...extra });
const quiet = { warn() {} };

test('save → load round-trip; transient fields are not written', async () => {
  const dir = tempDir();
  const store = createCollectionStore({ dataDir: dir, log: quiet });
  assert.deepEqual((await store.load()).tracks, []);
  const { revision } = await store.save([track('t1', { _enriching: true })], 0);
  assert.equal(revision, 1);

  const raw = fs.readFileSync(path.join(dir, 'collection.json'), 'utf8');
  assert.ok(!raw.includes('_enriching'));
  const reloaded = await createCollectionStore({ dataDir: dir, log: quiet }).load();
  assert.equal(reloaded.revision, 1);
  assert.equal(reloaded.tracks[0].bpm, '120');
  assert.equal(reloaded.recovered, false);
});

test('stale baseRevision → COLLECTION_CONFLICT', async () => {
  const store = createCollectionStore({ dataDir: tempDir(), log: quiet });
  await store.save([track('t1')], 0);
  await assert.rejects(store.save([track('t2')], 0), e => e.code === 'COLLECTION_CONFLICT' && e.extra.revision === 1);
});

test('corrupt file → loads the backup and reports recovered', async () => {
  const dir = tempDir();
  const store = createCollectionStore({ dataDir: dir, log: quiet });
  await store.save([track('t1')], 0);
  await store.save([track('t1'), track('t2')], 1); // previous version is now the backup
  const file = path.join(dir, 'collection.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').slice(0, 25)); // truncated mid-write

  const loaded = await createCollectionStore({ dataDir: dir, log: quiet }).load();
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.tracks.length, 1);
  assert.ok(fs.readdirSync(dir).some(f => f.startsWith('collection.corrupt-')), 'damaged file kept');
});

test('writes are atomic: a leftover temp file never replaces the collection', async () => {
  const dir = tempDir();
  const store = createCollectionStore({ dataDir: dir, log: quiet });
  await store.save([track('t1')], 0);
  // Simulate a crash after the temp write but before rename.
  fs.writeFileSync(path.join(dir, 'collection.json.dead.tmp'), '{"half":');
  const loaded = await createCollectionStore({ dataDir: dir, log: quiet }).load();
  assert.equal(loaded.recovered, false);
  assert.equal(loaded.tracks.length, 1);
});

test('rejects malformed tracks and duplicate ids', async () => {
  const store = createCollectionStore({ dataDir: tempDir(), log: quiet });
  await assert.rejects(store.save([{ id: '../x' }], 0), { code: 'VALIDATION' });
  await assert.rejects(store.save([track('a'), track('a')], 0), { code: 'VALIDATION' });
  await assert.rejects(store.save([track('a', { title: { evil: 1 } })], 0), { code: 'VALIDATION' });
});
