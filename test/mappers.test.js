import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapTracklist, mapSearchResult, mapSearchHitOnly, mapBasicInformation, mapPagination, mapRelease, stripDisambiguation,
} from '../server/discogs/mappers.js';
import { fixtureJson } from './helpers.js';

const release = fixtureJson('release-251840.json');

test('tracklist keeps only tracks and strips artist disambiguation', () => {
  const tracks = mapTracklist(release.tracklist);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0], { title: 'Holiday', artist: '', duration: '6:12', position: 'A1', bpm: '', key: '' });
  assert.equal(tracks[1].artist, 'Moodymann, Andrés');
});

test('search result combines the hit and its release detail', () => {
  const hit = fixtureJson('search.json').results[0];
  const r = mapSearchResult(hit, release);
  assert.equal(r.artist, 'Moodymann');
  assert.equal(r.album, 'Black Mahogani');
  assert.equal(r.genre, 'Deep House, Soul');
  assert.equal(r.label, 'Peacefrog Records');
  assert.equal(r.discogsUrl, 'https://www.discogs.com/release/251840');
  assert.equal(r.tracks.length, 2);
});

test('search hit without detail falls back to the title split', () => {
  const r = mapSearchHitOnly(fixtureJson('search.json').results[1]);
  assert.equal(r.artist, 'Someone');
  assert.equal(r.album, 'Something - Else');
  assert.deepEqual(r.tracks, []);
});

test('collection/wantlist items and pagination', () => {
  const wants = fixtureJson('wants.json');
  const item = mapBasicInformation(wants.wants[0].basic_information);
  assert.equal(item.artist, 'Mike Dreben');
  assert.equal(item.thumb, 'https://i.discogs.com/c.jpg');
  assert.equal(item.formats, 'Vinyl');
  assert.deepEqual(mapPagination(wants.pagination), { page: 2, pages: 35, items: 69, perPage: 2 });
});

test('release keeps videos for enrichment', () => {
  const r = mapRelease(release);
  assert.equal(r.videos.length, 2);
  assert.equal(stripDisambiguation('A (12), B (3)'), 'A, B');
});
