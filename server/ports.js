// Interfaces between the server (plain Node, runs in Electron's utility
// process) and the desktop shell. The server depends only on these shapes —
// never on Electron — so it can be tested with stubs. `electron/adapters/*`
// implements them, and `rpcClient.js` proxies them over the parent port.

/**
 * @typedef {object} SecretStore  The Discogs token, encrypted with the OS keychain.
 * @property {() => Promise<string|null>} get
 * @property {(token: string) => Promise<void>} set
 * @property {() => Promise<void>} clear
 */

/**
 * @typedef {{ firstName: string, discogsUsername: string, onboardedAt: string|null, tokenVerifiedAt: string|null }} Profile
 * @typedef {object} ProfileStore
 * @property {() => Promise<Profile|null>} get
 * @property {(profile: Profile) => Promise<void>} set
 */

/**
 * @typedef {{ beatport: boolean, youtube: boolean }} Settings
 * @typedef {object} SettingsStore
 * @property {() => Promise<Settings>} get
 * @property {(settings: Settings) => Promise<void>} set
 */

/**
 * @typedef {object} PageFetcher  Loads a page in a real browser (gets past bot checks).
 * @property {(url: string, opts: { waitFor: string, timeoutMs: number }) => Promise<string>} fetchHtml
 */

// The RPC methods main exposes to the server — the allow-list both sides share.
export const RPC_METHODS = Object.freeze([
  'secretStore.get', 'secretStore.set', 'secretStore.clear',
  'profileStore.get', 'profileStore.set',
  'settingsStore.get', 'settingsStore.set',
  'pageFetcher.fetchHtml',
]);

export const DEFAULT_SETTINGS = Object.freeze({ beatport: true, youtube: true });
