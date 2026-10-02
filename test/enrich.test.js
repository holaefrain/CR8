import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { parseBeatportTracks, pickMatch, createBeatportSource } from '../server/enrich/beatport.js';
import { toCanonicalYouTubeUrl, buildYtDlpArgs, createYouTubeSource, matchVideoToTrack } from '../server/enrich/youtube.js';
import { createEnrichService } from '../server/enrich/service.js';
import { createLimiter } from '../server/lib/limiter.js';
import { mapRelease } from '../server/discogs/mappers.js';
import { fixture, fixtureJson } from './helpers.js';

test('beatport: parses __NEXT_DATA__ and picks the matching track', async () => {
  const tracks = parseBeatportTracks(fixture('beatport-search.html'));
  assert.equal(tracks.length, 2);
  assert.equal(pickMatch(tracks, 'Paranoid London', 'Transmission 5').track_name, 'Transmission 5');

  const bp = createBeatportSource({ pageFetcher: { fetchHtml: async () => fixture('beatport-search.html') }, limiter: createLimiter(1), log: {} });
  assert.deepEqual(await bp.lookup('Paranoid London', 'Transmission 5'), { bpm: 123, key: 'Ab Minor', duration: '5:57' });
  assert.equal(parseBeatportTracks('<html>challenge</html>'), null);
});

test('youtube: only canonical YouTube video URLs reach yt-dlp', () => {
  assert.equal(toCanonicalYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(toCanonicalYouTubeUrl('http://youtu.be/dQw4w9WgXcQ?t=3'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(toCanonicalYouTubeUrl('https://m.youtube.com/embed/dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  for (const bad of [
    '--exec=touch /tmp/pwn',
    'http://169.254.169.254/latest/meta-data',
    'https://evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=--exec=x',
    'file:///etc/passwd',
    'https://www.youtube.com/playlist?list=abc',
  ]) assert.equal(toCanonicalYouTubeUrl(bad), null, bad);

  const args = buildYtDlpArgs('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(args.at(-2), '--');
  assert.equal(args.at(-1), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('youtube: rejected input never spawns a process', async () => {
  let spawned = 0;
  const yt = createYouTubeSource({
    binaries: { ytDlpPath: async () => '/bin/yt-dlp', ffmpegPath: '/bin/ffmpeg' },
    limiter: createLimiter(1),
    spawn: () => { spawned++; throw new Error('should not spawn'); },
  });
  await assert.rejects(yt.downloadPCM('--exec=touch /tmp/pwn'), /Not a YouTube video URL/);
  await assert.rejects(yt.downloadPCM('http://169.254.169.254/'), /Not a YouTube video URL/);
  assert.equal(spawned, 0);
});

test('youtube: valid input spawns yt-dlp with "--" before the canonical URL', async () => {
  const calls = [];
  const fakeProc = () => {
    const p = new EventEmitter();
    p.stdin = new PassThrough(); p.stdout = new PassThrough(); p.stderr = new PassThrough();
    p.kill = () => {};
    return p;
  };
  const yt = createYouTubeSource({
    binaries: { ytDlpPath: async () => '/bin/yt-dlp', ffmpegPath: '/bin/ffmpeg' },
    limiter: createLimiter(1),
    spawn: (cmd, args) => {
      const p = fakeProc();
      calls.push({ cmd, args });
      if (cmd === '/bin/ffmpeg') setImmediate(() => { p.stdout.end(Buffer.alloc(8)); });
      return p;
    },
  });
  const samples = await yt.downloadPCM('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(samples.length, 4);
  assert.equal(calls[0].cmd, '/bin/yt-dlp');
  assert.deepEqual(calls[0].args.slice(-2), ['--', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
});

test('video matching ignores side prefixes and artist names', () => {
  const videos = mapRelease(fixtureJson('release-251840.json')).videos;
  assert.equal(matchVideoToTrack('A2. Roberta Jean Machine', videos), 'https://youtu.be/aaaaaaaaaaa');
});

function enrichWith({ settings, beatport, youtubeCalls = [] }) {
  const release = mapRelease(fixtureJson('release-251840.json'));
  return createEnrichService({
    discogs: { getRelease: async () => release },
    beatport: { lookup: beatport },
    youtube: { downloadPCM: async uri => { youtubeCalls.push(uri); return new Float32Array(4); } },
    dsp: { analyze: async () => ({ bpm: 118, key: 'A minor' }) },
    settingsStore: { get: async () => settings },
    log: {},
  });
}

test('enrich: Beatport first, YouTube fallback, results per track', async () => {
  const youtubeCalls = [];
  const svc = enrichWith({
    settings: { beatport: true, youtube: true },
    beatport: async (artist, title) => (title === 'Holiday' ? { bpm: 122, key: 'C minor', duration: '6:00' } : null),
    youtubeCalls,
  });
  const results = [];
  await svc.enrichRelease(251840, r => results.push(r));
  results.sort((a, b) => a.i - b.i);
  assert.deepEqual(results[0], { i: 0, title: 'Holiday', bpm: 122, key: '5A - C minor' }); // Discogs duration wins
  assert.deepEqual(results[1], { i: 1, title: 'Roberta Jean Machine', bpm: 118, key: '8A - A minor' });
  assert.deepEqual(youtubeCalls, ['https://youtu.be/aaaaaaaaaaa']);
});

test('enrich: respects disabled sources', async () => {
  let beatportCalls = 0;
  const youtubeCalls = [];
  const svc = enrichWith({
    settings: { beatport: false, youtube: false },
    beatport: async () => { beatportCalls++; return null; },
    youtubeCalls,
  });
  const results = [];
  await svc.enrichRelease(251840, r => results.push(r));
  assert.equal(beatportCalls, 0);
  assert.equal(youtubeCalls.length, 0);
  assert.ok(results.every(r => r.bpm === '' && r.key === ''));
});
