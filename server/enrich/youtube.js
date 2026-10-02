import { spawn as nodeSpawn } from 'child_process';

export const SAMPLE_RATE = 22050;
const DOWNLOAD_SECONDS = 90;
// s16le mono: 2 bytes/sample. Allow 10% slack before killing the pipeline.
const MAX_PCM_BYTES = Math.ceil(SAMPLE_RATE * DOWNLOAD_SECONDS * 2 * 1.1);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
const VIDEO_ID = /^[\w-]{11}$/;

// The only way a URL reaches yt-dlp. Discogs video entries are user-submitted,
// so accept nothing but a YouTube video ID, rebuilt into a canonical URL — an
// argument like "--exec=…" or an internal address can never get through.
export function toCanonicalYouTubeUrl(uri) {
  let url;
  try { url = new URL(String(uri)); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;

  let id = null;
  if (url.hostname.toLowerCase() === 'youtu.be') id = url.pathname.slice(1);
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else id = url.pathname.match(/^\/(?:embed|shorts|v)\/([^/]+)/)?.[1] ?? null;

  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function buildYtDlpArgs(canonicalUrl) {
  return [
    '-x', '-f', 'bestaudio',
    '--download-sections', `*0-${DOWNLOAD_SECONDS}`,
    '--no-playlist',
    '--max-filesize', '30M',
    '--match-filter', 'duration < 1200',
    '-o', '-',
    '--quiet',
    '--', canonicalUrl,
  ];
}

// ── Video-to-track title matching ──────────────────────────────────────────
function normalize(str) {
  return str
    .toLowerCase()
    .replace(/feat\.?.*$/i, '')        // strip "feat. X"
    .replace(/\(.*?\)/g, '')           // strip parentheses
    .replace(/\[.*?\]/g, '')           // strip brackets
    .replace(/^[a-z]\d*[\.\s:–\-]+/i, '') // strip side/position prefix: A1. B2: etc.
    .replace(/^side\s+[ab]\s*[-:.]?\s*/i, '') // strip "Side A/B"
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchVideoToTrack(trackTitle, videos) {
  if (!videos?.length) return null;
  const trackNorm = normalize(trackTitle);
  if (!trackNorm) return null;

  let bestUrl = null;
  let bestScore = 0;

  for (const video of videos) {
    if (!video?.uri || !video?.title) continue;

    // Strip "Artist - " prefix common in video titles
    const stripped = video.title.replace(/^[^–\-]+(–|-)\s*/, '');
    const videoNorm = normalize(stripped);
    if (!videoNorm) continue;

    // Exact match — return immediately
    if (videoNorm === trackNorm) return video.uri;

    // Substring containment — score by length ratio to penalise over-broad matches
    if (videoNorm.includes(trackNorm) || trackNorm.includes(videoNorm)) {
      const score = Math.min(videoNorm.length, trackNorm.length) /
                    Math.max(videoNorm.length, trackNorm.length);
      if (score > bestScore) { bestScore = score; bestUrl = video.uri; }
      continue;
    }

    // Word-overlap fallback (threshold ≥ 0.6)
    const tw = new Set(trackNorm.split(' ').filter(w => w.length > 2));
    const vw = new Set(videoNorm.split(' ').filter(w => w.length > 2));
    if (tw.size === 0) continue;
    let overlap = 0;
    for (const w of tw) if (vw.has(w)) overlap++;
    const score = overlap / Math.max(tw.size, vw.size);
    if (score >= 0.6 && score > bestScore) { bestScore = score; bestUrl = video.uri; }
  }

  return bestUrl;
}

// ── Audio download via yt-dlp | ffmpeg ────────────────────────────────────
export function createYouTubeSource({ binaries, limiter, spawn = nodeSpawn, timeoutMs = 90_000 }) {
  async function downloadPCM(uri) {
    const url = toCanonicalYouTubeUrl(uri);
    if (!url) throw new Error('Not a YouTube video URL');
    const ytDlpPath = await binaries.ytDlpPath();
    return limiter.run(() => pipeToPCM(ytDlpPath, binaries.ffmpegPath, url));
  }

  function pipeToPCM(ytDlpPath, ffmpegPath, url) {
    return new Promise((resolve, reject) => {
      const ytdlp = spawn(ytDlpPath, buildYtDlpArgs(url), { stdio: ['ignore', 'pipe', 'pipe'] });
      const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-f', 's16le',
        '-ac', '1',
        '-ar', String(SAMPLE_RATE),
        '-loglevel', 'error',
        'pipe:1',
      ], { stdio: ['pipe', 'pipe', 'pipe'] });

      let settled = false;
      const finish = (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) { ytdlp.kill('SIGKILL'); ffmpeg.kill('SIGKILL'); reject(err); } else resolve(value);
      };

      ytdlp.stdout.pipe(ffmpeg.stdin);
      ytdlp.stderr.on('data', () => {});  // suppress yt-dlp output
      ffmpeg.stderr.on('data', () => {});
      ffmpeg.stdin.on('error', () => {}); // EPIPE when ffmpeg exits early

      const chunks = [];
      let bytes = 0;
      ffmpeg.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_PCM_BYTES) return finish(new Error('Audio longer than expected'));
        chunks.push(chunk);
      });

      const timer = setTimeout(() => finish(new Error('Audio download timed out')), timeoutMs);

      ffmpeg.stdout.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 2) return finish(new Error('Empty audio buffer'));
        // Convert S16LE → Float32
        const samples = new Float32Array(Math.floor(buf.length / 2));
        for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(i * 2) / 32768.0;
        finish(null, samples);
      });

      ffmpeg.on('error', err => finish(err));
      ytdlp.on('error', err => finish(err));
    });
  }

  return { downloadPCM };
}
