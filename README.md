# CR8

CR8 is a desktop vinyl manager for DJs and collectors: search Discogs, tag every track with BPM and Camelot key, and print DYMO labels for your crates. Everything stays on your computer.

**Download:** [macOS (Apple Silicon)](https://github.com/holaefrain/CR8/releases/latest/download/CR8-mac-arm64.dmg) · [macOS (Intel)](https://github.com/holaefrain/CR8/releases/latest/download/CR8-mac-x64.dmg) · [Windows](https://github.com/holaefrain/CR8/releases/latest/download/CR8-win-x64.exe) · [All releases](https://github.com/holaefrain/CR8/releases)

---

## First run

1. **About you**: enter your first name (optional) and your Discogs username. CR8 checks the username exists as you type.
2. **Connect your Discogs token**: the app walks you through it:
   1. Sign in at [discogs.com](https://www.discogs.com).
   2. Click your avatar (top right) → **Settings**.
   3. Open the **Developers** tab ([discogs.com/settings/developers](https://www.discogs.com/settings/developers)).
   4. Click **Generate new token** and copy it.
   5. Paste it into CR8 and click **Verify & save**.

   CR8 asks Discogs who the token belongs to, and only saves it if it matches your username. The token is encrypted with your operating system's keychain (macOS Keychain / Windows DPAPI) and is only ever sent to Discogs.
3. You're in. To change the token later (for example after generating a new one on Discogs), go to **Discogs tab → Rotate token**.

> **macOS keychain prompt:** the first time CR8 saves your token, macOS may ask whether CR8 can use its "CR8 Safe Storage" keychain item. That item holds the key that encrypts your token, so choose **Always Allow**.

---

## Features

### Search
- Search the Discogs database by artist, album or track, with filters (artist, label, country, year, genre).
- Click a result to add the whole album to your collection. BPM and key fill in track by track as they're found.

### Collection
- **Saved on your computer** and restored every time you open CR8.
- Edit position, duration, BPM and key inline (the key field autocompletes Camelot codes: `8A`, `8A — A minor` or `A minor`).
- **Export backup / Import backup** (.json) to move your collection between computers. When importing you can replace your current collection, or merge with it and skip duplicates.

### BPM / key enrichment
1. **Beatport** first. CR8 looks the track up in a hidden browser window, which gets past Beatport's bot check, so FlareSolverr and Docker are no longer needed.
2. **YouTube audio analysis** as a fallback. CR8 downloads the first 90 s of a video linked on the Discogs release and runs tempo detection plus Krumhansl-Schmuckler key analysis. It uses a bundled ffmpeg and a [yt-dlp](https://github.com/yt-dlp/yt-dlp) helper that CR8 downloads on first use, checks against its SHA-256 checksum, and keeps updated.

Turn either source on or off in **Discogs tab → Enrichment sources**. Both run on your computer, and you're responsible for using them in line with each site's terms.

### Export
- **Print labels** straight to a DYMO LabelWriter (450, 450 Turbo, 550, 550 Turbo, 4XL, 5XL, Wireless) through [DYMO Connect](https://www.dymo.com/software.html), which must be running. On 550-series printers CR8 reads the installed roll. You can split labels to fit the roll, by a fixed number of tracks, or by vinyl side.
- **Excel (.xlsx)** and **DYMO Connect CSV** exports.

### Discogs tab
- Your profile, token status (`•••• last4`, last verified), **Rotate token** and **Remove**.
- Browse your **wantlist** (click to add a release to your collection) and your **Discogs collection**.
- **Export to Discogs**: push up to 100 albums from your local collection to your wantlist or collection.

### Rate limiting
Discogs allows 60 requests per minute per token. CR8 paces its calls to stay under that. If the limit is hit anyway, CR8 shows a countdown and retries once.

---

## Development

Requirements: Node.js 22+ (Node 24 recommended).

```bash
git clone https://github.com/holaefrain/CR8.git
cd CR8
npm install
npm run dev        # starts the desktop app
npm test           # 38 tests: services, HTTP guard, collection store, enrichment, import boundaries
```

`npm run dev:server` runs the local server **without Electron**, for debugging the API with curl:
- It stores the profile and settings as plain JSON in `.cr8-dev/` (gitignored).
- You can set `CR8_DEV_DISCOGS_TOKEN` in your shell to skip the keychain.
- Every request needs the `X-CR8-Secret` header that it prints when it starts.

`npm run dev` clears `ELECTRON_RUN_AS_NODE`, which some editors (VS Code) set for child processes. Without that, Electron starts as plain Node.

### Architecture

```
main process (electron/)        OS + Electron APIs only: window, security policy, updater,
                                keychain-backed token store, profile/settings files,
                                hidden Beatport window
      ▲  MessagePort RPC (allow-listed methods in server/ports.js)
utility process (server/)       plain Node, never imports electron: Express on 127.0.0.1:<random>,
                                Discogs client + throttle, enrichment, collection store,
                                audio DSP in worker threads
      ▲  HTTP + NDJSON, every request carries a per-launch secret injected by Electron
renderer (public/)              sandboxed pages: onboarding.html, app.html (ES modules, no inline scripts)
```

```
CR8/
├── electron/           main process: main.js, security.js, rpcHost.js, preload.cjs, adapters/
├── server/             app.js (wiring), ports.js, routes/, discogs/, account/, enrich/, collection/
├── public/             app.html, onboarding.html, css/, js/ (api.js, app/*, components/*)
├── shared/             errorCodes.js, styles/ (design tokens), motion/ (anime.js scope + hero)
├── site/               the website (anime.js homepage, privacy page); `npm run build:site`
├── test/               node:test suites + fixtures
├── scripts/            dev launcher, website build, electron-builder afterPack (fuses)
└── .github/workflows/  ci.yml, release.yml
```

### Website

`npm run build:site` copies the shared tokens and motion modules, the pinned anime.js bundle and the fonts into `site/`, which is then deployed as-is (e.g. Cloudflare Pages: build command `npm run build:site`, output directory `site`). `site/_headers` sets the CSP and security headers.

### Releasing

Push a tag such as `v1.0.0`. `.github/workflows/release.yml` builds macOS arm64, macOS x64 and Windows x64, signs them, notarizes the macOS builds, and publishes a **draft** GitHub release. It then checks that the asset names match the website's download links. Repository secrets needed:

| Secret | For |
|---|---|
| `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD` | Developer ID Application certificate |
| `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` | Notarization (App Store Connect API key) |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Windows signing via Azure Trusted Signing. Also add `win.azureSignOptions` (endpoint, account, certificate profile) to the `build` config in package.json. |

Without signing secrets the builds still complete, but unsigned. macOS Gatekeeper and Windows SmartScreen will then warn users, and macOS auto-update won't work.

To make a local unsigned build: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir -c.mac.notarize=false`.

---

## Troubleshooting
- **"Discogs rejected your token"**: you probably generated a new token on Discogs, which turns off the old one. Use **Discogs tab → Rotate token**.
- **Printer not detected**: open DYMO Connect and make sure the LabelWriter is connected, then click **↺ Detect** in the Export tab.
- **No BPM/key for a track**: Beatport had no match and there was no matching YouTube video on the Discogs release. Enter BPM and key by hand in the Collection table.
- **"Restored your collection from backup"**: the collection file was damaged, and CR8 loaded the previous good copy. The damaged file is kept as `collection.corrupt-<time>.json` in CR8's data folder.

Data provided by [Discogs](https://www.discogs.com). CR8 is not affiliated with Discogs, Beatport or DYMO.
