import { ndjson } from '../api.js';
import * as store from './collectionStore.js';

// Adds a release's tracks to the collection, then streams BPM/key results in
// as each track finishes enriching. Shared by search and the wantlist.
export async function addAlbum(release) {
  const base = {
    artist: release.artist, album: release.album, year: release.year,
    genre: release.genre, label: release.label, discogsId: release.discogsId,
  };
  const rows = release.tracks?.length
    ? release.tracks.map(t => ({ ...base, title: t.title, duration: t.duration, position: t.position }))
    : [{ ...base, title: '—' }];

  const added = store.add(rows);
  const ids = added.map(t => t.id);
  if (!release.discogsId) return added;

  store.setEnriching(ids, true);
  try {
    // Lines arrive as { i, bpm, key, duration? } in the release's track order.
    await ndjson('/api/enrich', { discogsReleaseId: release.discogsId }, result => {
      const track = added[result.i];
      if (!track || !store.get(track.id)) return;
      store.update(track.id, {
        bpm: result.bpm || '',
        key: result.key || '',
        ...(result.duration ? { duration: result.duration } : {}),
      });
      store.setEnriching([track.id], false);
    });
  } catch (e) {
    console.warn('Enrichment failed:', e.message);
  }
  // Anything the stream never reported stops spinning.
  store.setEnriching(ids, false);
  return added;
}
