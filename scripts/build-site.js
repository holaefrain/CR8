// Copies the shared design tokens/motion modules, the pinned anime.js bundle
// and the self-hosted fonts into site/, so the static website deploys on its
// own (no CDN; CSP can stay `script-src 'self'`).
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const mod = p => path.join(ROOT, 'node_modules', p);

async function copy(from, to, filter) {
  await fs.cp(from, to, { recursive: true, filter });
}

await fs.rm(path.join(SITE, 'vendor'), { recursive: true, force: true });
await fs.rm(path.join(SITE, 'shared'), { recursive: true, force: true });

await copy(path.join(ROOT, 'shared'), path.join(SITE, 'shared'));
await copy(mod('animejs/dist/bundles/anime.esm.min.js'), path.join(SITE, 'vendor/anime/anime.esm.min.js'));

// Only the CSS + woff2 files the site links to.
for (const font of ['dm-mono', 'space-grotesk']) {
  await copy(mod(`@fontsource/${font}`), path.join(SITE, 'vendor/fonts', font),
    async src => /\.(css|woff2)$/.test(src) || (await fs.stat(src)).isDirectory());
}

console.log('site/ ready — deploy the site/ folder (e.g. Cloudflare Pages: build command "npm run build:site", output "site").');
