// DEVELOPMENT ONLY: runs the server without Electron, storing the profile,
// settings and token as plain JSON in ./.cr8-dev/. Beatport lookups use a
// plain fetch (usually blocked by Cloudflare). Never used by the desktop app.
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { startServer } from '../app.js';
import { createBinaries } from '../binaries.js';
import { DEFAULT_SETTINGS } from '../ports.js';

if (process.env.NODE_ENV === 'production') {
  console.error('dev:server refuses to run with NODE_ENV=production');
  process.exit(1);
}

const dir = path.resolve('.cr8-dev');
await fs.mkdir(dir, { recursive: true });

function jsonFile(name, fallback) {
  const file = path.join(dir, name);
  return {
    get: async () => JSON.parse(await fs.readFile(file, 'utf8').catch(() => 'null')) ?? fallback,
    set: async value => fs.writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 }),
  };
}

const tokenFile = jsonFile('token.json', null);
// Dev convenience: CR8_DEV_DISCOGS_TOKEN (read from your shell, never written
// to disk) takes the place of the keychain-backed store.
const envToken = process.env.CR8_DEV_DISCOGS_TOKEN || null;
const token = envToken
  ? { get: async () => envToken, set: async () => {}, clear: async () => {} }
  : tokenFile;
const which = cmd => { try { return execFileSync('which', [cmd]).toString().trim(); } catch { return null; } };
const secret = process.env.CR8_SECRET || crypto.randomBytes(32).toString('hex');

const { port } = await startServer({
  port: Number(process.env.PORT) || 3000,
  secret,
  dataDir: dir,
  userAgent: 'CR8/dev +https://github.com/holaefrain/CR8',
  secretStore: { get: token.get, set: token.set, clear: token.clear ?? (() => token.set(null)) },
  profileStore: jsonFile('profile.json', null),
  settingsStore: jsonFile('settings.json', DEFAULT_SETTINGS),
  pageFetcher: {
    fetchHtml: async url => {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  },
  binaries: createBinaries({
    binDir: path.join(dir, 'bin'),
    ffmpegPath: createRequire(import.meta.url)('ffmpeg-static'),
    ytDlpOverride: which('yt-dlp'),
  }),
});

console.log(`\n CR8 dev server on http://127.0.0.1:${port}`);
console.log(` Requests need the header  X-CR8-Secret: ${secret}\n`);
