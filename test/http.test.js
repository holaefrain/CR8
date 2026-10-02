import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/app.js';
import { ErrorCodes } from '../shared/errorCodes.js';
import { stubPorts, tempDir, fakeDiscogsFetch } from './helpers.js';
import { esc } from '../public/js/dom.js';

const SECRET = 's'.repeat(64);
const ports = stubPorts({ token: 'x'.repeat(36) + 'LAST', profile: { discogsUsername: 'djuser', firstName: 'Ana' } });
const { fetch: discogsFetch } = fakeDiscogsFetch({
  'GET /releases/7': { status: 401, body: { message: 'bad' } },
});
const server = await startServer({
  ...ports,
  secret: SECRET,
  dataDir: tempDir(),
  userAgent: 'CR8/test',
  binaries: { ytDlpPath: async () => '/nope', ffmpegPath: '/nope' },
  fetch: discogsFetch,
  log: { error() {}, warn() {} },
});
after(() => server.close());

const base = `http://127.0.0.1:${server.port}`;
const call = (path, { headers = {}, ...init } = {}) =>
  fetch(base + path, { ...init, headers: { 'X-CR8-Secret': SECRET, 'Content-Type': 'application/json', ...headers } });

test('local guard: secret, Host and Origin are all required', async () => {
  assert.equal((await fetch(base + '/api/me')).status, 403);
  assert.equal((await call('/api/me', { headers: { 'X-CR8-Secret': 'wrong' } })).status, 403);
  assert.equal((await call('/api/me', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/api/me', { headers: { Origin: base } })).status, 200);
  assert.equal((await fetch(base + '/', {})).status, 403, 'pages are guarded too');
});

test('/api/me exposes only the last 4 characters of the token', async () => {
  const res = await call('/api/me');
  const me = await res.json();
  assert.equal(me.discogs.last4, 'LAST');
  assert.ok(!JSON.stringify(me).includes('xxxxxxxx'));
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
});

test('errors are { error, code } with a known code — never a stack or raw message', async () => {
  const codes = new Set(Object.values(ErrorCodes));
  const cases = [
    [await call('/api/search', { method: 'POST', body: '{bad' }), 400],
    [await call('/api/search', { method: 'POST', body: JSON.stringify({ query: 'q'.repeat(201) }) }), 400],
    [await call('/api/enrich', { method: 'POST', body: JSON.stringify({ discogsReleaseId: '--exec=x' }) }), 400],
    [await call('/api/discogs/release/7'), 401],
    [await call('/api/nope'), 404],
    [await call('/api/discogs/export', { method: 'POST', body: JSON.stringify({ albums: Array(101).fill({}) }) }), 400],
  ];
  for (const [res, status] of cases) {
    assert.equal(res.status, status);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['code', 'error']);
    assert.ok(codes.has(body.code), body.code);
    assert.ok(!/at .*\.js/.test(body.error));
  }
});

test('collection round-trip over HTTP with revision check', async () => {
  const put = (baseRevision, tracks) => call('/api/collection', { method: 'PUT', body: JSON.stringify({ baseRevision, tracks }) });
  assert.equal((await put(0, [{ id: 'a1', title: 'T' }])).status, 200);
  assert.equal((await put(0, [])).status, 409);
  const doc = await (await call('/api/collection')).json();
  assert.equal(doc.revision, 1);
  assert.equal(doc.tracks[0].title, 'T');
});

test('esc() escapes quotes for attribute values', () => {
  assert.equal(esc('" onerror=x \'<b>&'), '&quot; onerror=x &#39;&lt;b&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});
