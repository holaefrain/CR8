import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

const RELEASES = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const UPDATE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

export function ytDlpAssetName(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') return 'yt-dlp_macos';
  if (platform === 'win32') return 'yt-dlp.exe';
  if (platform === 'linux') return arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  throw new Error(`Unsupported platform: ${platform}`);
}

// Finds the external tools enrichment needs. ffmpeg ships with the app; yt-dlp
// changes too often to bundle, so it is downloaded on first use (verified
// against the release's SHA2-256SUMS) and self-updates weekly.
export function createBinaries({ binDir, ffmpegPath, ytDlpOverride, fetch = globalThis.fetch, log = console }) {
  const exe = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  let downloading = null;
  let updateChecked = false;

  async function download() {
    const asset = ytDlpAssetName();
    log.info?.(`[yt-dlp] downloading ${asset}`);
    const [sumsRes, binRes] = await Promise.all([
      fetch(`${RELEASES}/SHA2-256SUMS`, { signal: AbortSignal.timeout(30_000) }),
      fetch(`${RELEASES}/${asset}`, { signal: AbortSignal.timeout(180_000) }),
    ]);
    if (!sumsRes.ok || !binRes.ok) throw new Error('yt-dlp download failed');

    const expected = (await sumsRes.text()).split('\n')
      .map(line => line.trim().split(/\s+/))
      .find(([, name]) => name === asset)?.[0];
    const bytes = Buffer.from(await binRes.arrayBuffer());
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!expected || expected !== actual) throw new Error('yt-dlp checksum mismatch — refusing to install');

    await fs.mkdir(binDir, { recursive: true });
    const tmp = `${exe}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, bytes, { mode: 0o755 });
    await fs.rename(tmp, exe);
    updateChecked = true;
  }

  function updateInBackground() {
    updateChecked = true;
    const child = spawn(exe, ['-U'], { stdio: 'ignore' });
    child.on('error', e => log.warn?.(`[yt-dlp] update failed: ${e.message}`));
    child.on('exit', () => fs.utimes(exe, new Date(), new Date()).catch(() => {}));
  }

  async function ytDlpPath() {
    if (ytDlpOverride) return ytDlpOverride;
    try {
      const stat = await fs.stat(exe);
      if (!updateChecked && Date.now() - stat.mtimeMs > UPDATE_EVERY_MS) updateInBackground();
      return exe;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    downloading ??= download().finally(() => { downloading = null; });
    await downloading;
    return exe;
  }

  return { ytDlpPath, ffmpegPath };
}
