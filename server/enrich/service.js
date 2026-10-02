import { toCamelot } from './camelot.js';
import { matchVideoToTrack, SAMPLE_RATE } from './youtube.js';

const MAX_TRACKS = 40;

// Enrichment orchestration: Beatport first (human-verified BPM + key), then
// YouTube audio analysis as a fallback. Calls `onResult` once per track as
// soon as that track finishes, so the UI fills rows in one at a time.
export function createEnrichService({ discogs, beatport, youtube, dsp, settingsStore, log = console }) {
  async function enrichRelease(releaseId, onResult) {
    const release = await discogs.getRelease(releaseId);
    const settings = await settingsStore.get();
    const tracks = (release.tracks.length ? release.tracks : [{ title: release.album }]).slice(0, MAX_TRACKS);

    await Promise.all(tracks.map(async (track, i) => {
      const result = { i, title: track.title, bpm: '', key: '' };
      try {
        Object.assign(result, await enrichTrack(track, release, settings));
      } catch (e) {
        log.warn?.(`[Enrich] "${track.title}": ${e.message}`);
      }
      onResult(result);
    }));
  }

  async function enrichTrack(track, release, settings) {
    const artist = track.artist || release.artist;

    if (settings.beatport) {
      const bp = await beatport.lookup(artist, track.title);
      if (bp?.bpm || bp?.key) {
        // Discogs duration (if present) takes priority — Beatport's is the
        // digital release length, which can differ slightly from vinyl.
        return {
          bpm: bp.bpm || '',
          key: toCamelot(bp.key),
          ...(!track.duration && bp.duration ? { duration: bp.duration } : {}),
        };
      }
    }

    if (settings.youtube) {
      const uri = matchVideoToTrack(track.title, release.videos);
      if (!uri) return {};
      const samples = await youtube.downloadPCM(uri);
      const { bpm, key } = await dsp.analyze(samples, SAMPLE_RATE);
      return { bpm, key: toCamelot(key) };
    }
    return {};
  }

  return { enrichRelease };
}
