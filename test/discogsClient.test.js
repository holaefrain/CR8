import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiscogsClient } from '../server/discogs/client.js';
import { fakeDiscogsFetch } from './helpers.js';

function clientWith(routes, opts = {}) {
  let clock = 0;
  const slept = [];
  const { fetch, calls } = fakeDiscogsFetch(routes);
  const client = createDiscogsClient({
    getToken: async () => 'tok',
    userAgent: 'CR8/test',
    fetch,
    now: () => clock,
    sleep: async ms => { slept.push(ms); clock += ms; },
    ...opts,
  });
  return { client, calls, slept, advance: ms => { clock += ms; } };
}

test('sends the token and user agent', async () => {
  const { client, calls } = clientWith({ 'GET /users/x': { body: { ok: 1 } } });
  assert.deepEqual(await client.get('/users/x'), { ok: 1 });
  assert.equal(calls[0].headers.Authorization, 'Discogs token=tok');
  assert.equal(calls[0].headers['User-Agent'], 'CR8/test');
});

test('throttle: waits once the per-minute budget is used, then fails fast past maxQueueWait', async () => {
  const { client, slept } = clientWith({ 'GET /r': { body: {} } }, { perMinute: 3, maxQueueWaitMs: 70_000 });
  for (let i = 0; i < 3; i++) await client.get('/r');
  assert.deepEqual(slept, []);
  await client.get('/r'); // 4th call must wait for the window to roll over
  assert.equal(slept.length, 1);
  assert.equal(slept[0], 60_000);

  const strict = clientWith({ 'GET /r': { body: {} } }, { perMinute: 2, maxQueueWaitMs: 5_000 }).client;
  await strict.get('/r');
  await strict.get('/r');
  await assert.rejects(strict.get('/r'), e => e.code === 'DISCOGS_THROTTLED' && e.status === 429 && e.extra.retryAfter === 60);
});

test('429 honours Retry-After and pauses later calls', async () => {
  const { client } = clientWith({ 'GET /r': { status: 429, headers: { 'retry-after': '30' } } });
  await assert.rejects(client.get('/r'), e => e.code === 'DISCOGS_THROTTLED' && e.extra.retryAfter === 30);
  await assert.rejects(client.get('/r'), e => e.code === 'DISCOGS_THROTTLED' && e.extra.retryAfter === 30);
});

test('maps Discogs errors to app error codes', async () => {
  const { client } = clientWith({
    'GET /bad-token': { status: 401, body: { message: 'nope' } },
    'GET /missing': { status: 404, body: { message: 'Release not found.' } },
    'GET /boom': { status: 500, body: { message: 'oops' } },
  });
  await assert.rejects(client.get('/bad-token'), { code: 'DISCOGS_TOKEN_INVALID', status: 401 });
  await assert.rejects(client.get('/missing'), { code: 'NOT_FOUND', message: 'Release not found.' });
  await assert.rejects(client.get('/boom'), { code: 'DISCOGS_UPSTREAM', status: 502 });
});

test('no saved token → NOT_ONBOARDED; withToken() uses the candidate', async () => {
  const { fetch, calls } = fakeDiscogsFetch({ 'GET /oauth/identity': { body: { username: 'me' } } });
  const client = createDiscogsClient({ getToken: async () => null, userAgent: 'x', fetch });
  await assert.rejects(client.get('/oauth/identity'), { code: 'NOT_ONBOARDED' });
  assert.deepEqual(await client.withToken('cand').get('/oauth/identity'), { username: 'me' });
  assert.equal(calls[0].headers.Authorization, 'Discogs token=cand');
});

test('auth:false calls send no token', async () => {
  const { client, calls } = clientWith({ 'GET /users/u': { body: {} } });
  await client.get('/users/u', undefined, { auth: false });
  assert.equal(calls[0].headers.Authorization, undefined);
});
