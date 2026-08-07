import fetch from 'node-fetch';
import { analyzeAudio, matchVideoToTrack } from '../services/audioService.js';

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const CAMELOT_MAP = {
  'C major': '8B', 'C minor': '5A',
  'C# major': '3B', 'C# minor': '12A',
  'Db major': '3B', 'Db minor': '12A',
  'D major': '10B', 'D minor': '7A',
  'D# major': '5B', 'D# minor': '2A',
  'Eb major': '5B', 'Eb minor': '2A',
  'Ab major': '4B', 'Ab minor': '1A',
  'E major': '12B', 'E minor': '9A',
  'F major': '7B', 'F minor': '4A',
  'F# major': '2B', 'F# minor': '11A',
  'Gb major': '2B', 'Gb minor': '11A',
  'G major': '9B', 'G minor': '6A',
  'G# major': '4B', 'G# minor': '1A',
  'A major': '11B', 'A minor': '8A',
  'A# major': '6B', 'A# minor': '3A',
  'Bb major': '6B', 'Bb minor': '3A',
  'B major': '1B', 'B minor': '10A'
};

function toCamelot(keyName) {
  if (!keyName) return '';
  const normalised = keyName.trim()
    .replace(/\bmaj(or)?\b/i, 'major')
    .replace(/\bmin(or)?\b/i, 'minor');
  for (const [k, v] of Object.entries(CAMELOT_MAP)) {
    if (k.toLowerCase() === normalised.toLowerCase()) return `${v} - ${keyName.trim()}`;
  }
  return keyName;
}

const BEATPORT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  DNT: '1'
};

function findTrackArray(obj, depth = 0) {
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

function extractBeatportKey(track) {
  if (track.key_name) return track.key_name;
  const k = track.key;
  if (!k) return '';
  if (typeof k === 'object') return k.name || k.shortname || k.camelot_value || '';
  return String(k);
}

async function enrichWithBeatport(artist, title) {
  const q = encodeURIComponent(`${artist} ${title}`);
  const url = `https://www.beatport.com/search/tracks?q=${q}`;

  let html;
  try {
    const res = await fetch(url, { headers: BEATPORT_HEADERS });
    if (!res.ok) { console.warn(`[Beatport] HTTP ${res.status} for "${title}"`); return null; }
    html = await res.text();
  } catch (e) {
    console.warn(`[Beatport] fetch error for "${title}":`, e.message);
    return null;
  }

  const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!scriptMatch) { console.warn(`[Beatport] no __NEXT_DATA__ for "${title}"`); return null; }

  let data;
  try { data = JSON.parse(scriptMatch[1]); }
  catch (e) { console.warn(`[Beatport] JSON parse error: ${e.message}`); return null; }

  const tracks = findTrackArray(data);
  if (!tracks?.length) { console.warn(`[Beatport] no tracks in response for "${title}"`); return null; }

  const titleNorm = norm(title);
  const artistNorm = norm(artist);
  const match = tracks.find(t => {
    const tName = norm(t.track_name || t.name || t.title || '');
    const tArtists = (t.artists || []).map(a => norm(a.name || a.artist_name || '')).join(' ');
    return tName === titleNorm || (tName.includes(titleNorm) && tArtists.includes(artistNorm));
  }) || tracks.find(t => norm(t.track_name || t.name || t.title || '').includes(titleNorm)) || tracks[0];

  if (!match) return null;

  const bpm = match.bpm ? Math.round(match.bpm) : null;
  const key = extractBeatportKey(match);
  console.log(`[Beatport] "${title}" → ${bpm} BPM, ${key}`);
  if (!bpm && !key) return null;

  return { bpm, key };
}

async function enrichWithMusicBrainz(artist, title) {
  const query = `recording:"${title.replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&inc=tags&limit=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'VinylManager/1.0 (vinyl@manager.local)' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const recording = data.recordings?.[0];
  if (!recording) return null;

  const tags = recording.tags || [];
  let bpm = null;
  let key = null;
  for (const tag of tags) {
    const name = tag.name.toLowerCase().trim();
    const bpmMatch = name.match(/^(\d{2,3})\s*bpm$/) || name.match(/^bpm[:\s]+(\d{2,3})$/);
    if (bpmMatch) bpm = parseInt(bpmMatch[1]);
    if (/^[a-g][#b]?\s*(major|minor|maj|min)$/i.test(name)) key = tag.name;
  }
  return (bpm || key) ? { bpm, key } : null;
}

export function registerEnrichRoute(app) {
  app.post('/api/enrich', async (req, res) => {
    const { artist, album, tracks, videos } = req.body;
    if (!artist || !album || !tracks?.length) return res.status(400).json({ error: 'artist, album, and tracks required' });

    const results = tracks.map(t => ({ title: t.title, bpm: '', key: '' }));

    await Promise.all(tracks.map(async (track, i) => {
      const trackArtist = track.artist || artist;

      try {
        const bp = await enrichWithBeatport(trackArtist, track.title);
        if (bp?.bpm || bp?.key) {
          results[i].bpm = bp.bpm || '';
          results[i].key = toCamelot(bp.key);
          return;
        }
      } catch (e) {
        console.warn(`[Beatport] error for "${track.title}":`, e.message);
      }

      if (!videos?.length) return;
      const url = matchVideoToTrack(track.title, videos);
      if (!url) {
        console.log(`[YouTube] ${track.title} → no matching video`);
        return;
      }
      console.log(`[YouTube] ${track.title} → ${url}`);
      try {
        const { bpm, key } = await analyzeAudio(url);
        results[i].bpm = bpm;
        results[i].key = toCamelot(key);
        console.log(`[YouTube] ${track.title} → ${bpm} BPM, ${toCamelot(key)}`);
      } catch (e) {
        console.warn(`[YouTube] ${track.title} analysis failed:`, e.message);
      }
    }));

    res.json({ tracks: results });
  });
}
