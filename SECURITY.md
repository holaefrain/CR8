# Security Policy

## Supported Versions

Only the latest CR8 release receives security updates. The app updates itself, so make sure auto-update hasn't been blocked.

| Version | Supported |
| ------- | --------- |
| latest release | Yes |
| older releases | No |

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub's **[Report a vulnerability](https://github.com/holaefrain/CR8/security/advisories/new)** (Security → Advisories), not in a public issue.

You can expect an acknowledgment within a few days. If the vulnerability is confirmed, a fix will be prioritized accordingly. If it is not accepted, you will receive an explanation.

## How CR8 protects your data

CR8 is a desktop app with **no servers of its own**. It stores:

| Data | Where | Protection |
|---|---|---|
| Discogs personal access token | `credentials.bin` in the app data folder | Encrypted with Electron `safeStorage`, which uses a key held by the OS (macOS Keychain, Windows DPAPI). Never sent to the page, only to `api.discogs.com`. CR8 refuses to save it if secure storage is unavailable. |
| Profile (first name, Discogs username), settings | `profile.json`, `settings.json` | File permissions `0600` |
| Collection | `collection.json` (+ `collection.bak.json`) | Atomic writes. Contents are validated on load and save. |

The token is only accepted after Discogs' `/oauth/identity` confirms it belongs to the username the user entered.

## Threat model and mitigations

**Local server reachable by websites.** The UI talks to a local HTTP server on `127.0.0.1`, on a random port. Any website open in the user's browser could also send requests to it. Every request must therefore pass three checks:
- It carries a random secret created at each launch. Electron adds it only to requests from the CR8 window, so pages can't read it and websites can't send it.
- The `Host` header is `127.0.0.1:<port>`, which blocks DNS rebinding.
- Any `Origin` header is CR8's own.

**Process isolation.** The server runs in a utility process and never imports Electron (a test enforces this). It reaches OS features only through an allowlisted RPC (`server/ports.js`), and the main process validates every argument. Pages run sandboxed, with `contextIsolation`, no Node, and a minimal preload.

**Content Security Policy.** Pages use `script-src 'self'` with no inline scripts or handlers, and all third-party code (anime.js, ExcelJS, fonts) is bundled. Images are only allowed from Discogs' image CDN. Network connections are only allowed to CR8 itself and DYMO Connect on loopback.

**Navigation.** Windows can't navigate away from the app or open new windows. Links open in the system browser, and only for allowlisted HTTPS hosts (Discogs, Beatport, YouTube, DYMO, GitHub). Every permission request (camera, microphone, notifications, …) is denied.

**Third-party data.** Discogs data is user-submitted, so all of it is HTML-escaped (including in attributes) before rendering, and URLs are only used if they are `http(s)`.

**yt-dlp hardening.** Video URLs from Discogs never reach `yt-dlp` directly:
- The URL is parsed, only YouTube hosts are accepted, and it is rebuilt from the 11-character video ID.
- It is passed after a `--` separator, so it can't be read as an option.
- Downloads are capped by size, duration and time.

**Hidden Beatport window.** It uses its own sandboxed session partition with no preload, and can only load `https://www.beatport.com/`.

**Packaged binary.** Electron fuses turn off `RunAsNode`, `NODE_OPTIONS` and `--inspect`. The packaged app also enables ASAR integrity validation and only loads its code from the ASAR archive.

**Downloads.** The `yt-dlp` helper is checked against the SHA-256 sums published with its GitHub release before it is installed.

## Known considerations

- **Third-party sites.** Beatport lookups and YouTube audio analysis access those sites from the user's own machine. Each can be turned off in **Discogs tab → Enrichment sources**, and users are responsible for using them in line with those sites' terms.
- **DYMO printing over plain HTTP.** Label printing calls DYMO Connect's local web service at `http://127.0.0.1:41951` (loopback only). Plain HTTP is deliberate: DYMO Connect 1.6.x ships a server certificate with no private key, so its HTTPS listener fails every TLS handshake.
- **ExcelJS advisory.** ExcelJS depends on a `uuid` version with a moderate advisory (GHSA-w5hq-g745-h8pq). It only applies when a caller passes a buffer argument, which CR8 never does.
