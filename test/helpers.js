import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const fixture = name => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');
export const fixtureJson = name => JSON.parse(fixture(name));
export const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cr8-test-'));

// In-memory implementations of the ports in server/ports.js.
export function stubPorts({ token = null, profile = null, settings = { beatport: true, youtube: true } } = {}) {
  const state = { token, profile, settings, calls: { secretSet: 0 } };
  return {
    state,
    secretStore: {
      get: async () => state.token,
      set: async t => { state.token = t; state.calls.secretSet++; },
      clear: async () => { state.token = null; },
    },
    profileStore: { get: async () => state.profile, set: async p => { state.profile = p; } },
    settingsStore: { get: async () => state.settings, set: async s => { state.settings = s; } },
    pageFetcher: { fetchHtml: async () => fixture('beatport-search.html') },
  };
}

// A fake fetch for api.discogs.com: `routes` maps "METHOD /path" → { status, body, headers }.
export function fakeDiscogsFetch(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || 'GET'} ${u.pathname}`;
    calls.push({ key, url: u, headers: init.headers || {} });
    const r = typeof routes[key] === 'function' ? routes[key](u, init) : routes[key];
    if (!r) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status || 200, headers: r.headers || {},
    });
  };
  return { fetch, calls };
}
