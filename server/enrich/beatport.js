// Beatport lookup. Beatport sits behind a Cloudflare managed challenge, so
// HTML comes from the injected `pageFetcher` (a real browser window in the
// desktop app). Everything here is parsing + matching, kept pure for tests.

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Recursively find the first array whose items have a numeric `bpm` field
export function findTrackArray(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0]?.bpm === 'number') return obj;
    for (const item of obj) {
      const found = findTrackArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const val of Object.values(obj)) {
    const found = findTrackArray(val, depth + 1);
    if (found) return found;
  }
  return null;
}

export function msToDuration(ms) {
  if (!ms || typeof ms !== 'number') return '';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function extractBeatportKey(track) {
  // Beatport stores key as key_name (e.g. "D Major") and key_id (numeric)
  if (track.key_name) return track.key_name;
  // Fallback: legacy object form
  const k = track.key;
  if (!k) return '';
  if (typeof k === 'object') return k.name || k.shortname || k.camelot_value || '';
  return String(k);
}

export function parseBeatportTracks(html) {
  const scriptMatch = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) return null;
  try {
    return findTrackArray(JSON.parse(scriptMatch[1]));
  } catch {
    return null;
  }
}

export function pickMatch(tracks, artist, title) {
  const titleNorm = norm(title);
  const artistNorm = norm(artist);
  const nameOf = t => norm(t.track_name || t.name || t.title || '');
  return tracks.find(t => {
    const tName = nameOf(t);
    const tArtists = (t.artists || []).map(a => norm(a.name || a.artist_name || '')).join(' ');
    return tName === titleNorm || (tName.includes(titleNorm) && tArtists.includes(artistNorm));
  }) || tracks.find(t => nameOf(t).includes(titleNorm))
    || tracks[0]; // best-effort first result
}

export function searchUrl(artist, title) {
  return `https://www.beatport.com/search/tracks?q=${encodeURIComponent(`${artist} ${title}`)}`;
}

export function createBeatportSource({ pageFetcher, limiter, log = console }) {
  async function lookup(artist, title) {
    let html;
    try {
      html = await limiter.run(() => pageFetcher.fetchHtml(searchUrl(artist, title), {
        waitFor: 'script#__NEXT_DATA__', timeoutMs: 30_000,
      }));
    } catch (e) {
      log.warn?.(`[Beatport] fetch error for "${title}": ${e.message}`);
      return null;
    }

    const tracks = parseBeatportTracks(html);
    if (!tracks?.length) { log.warn?.(`[Beatport] no tracks for "${title}"`); return null; }

    const match = pickMatch(tracks, artist, title);
    if (!match) return null;
    const bpm = match.bpm ? Math.round(match.bpm) : null;
    const key = extractBeatportKey(match);
    if (!bpm && !key) return null;
    return { bpm, key, duration: msToDuration(match.length) };
  }

  return { lookup };
}
