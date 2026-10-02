import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService } from '../server/account/service.js';
import { AppError } from '../server/middleware/errors.js';
import { stubPorts } from './helpers.js';

const TOKEN = 'a'.repeat(40);

function setup({ identity = 'DJUser', exists = true, profile } = {}) {
  const ports = stubPorts({ profile });
  const discogs = {
    identity: async t => {
      if (t === 'b'.repeat(40)) throw new AppError('DISCOGS_TOKEN_INVALID', 401, 'rejected');
      return { username: identity };
    },
    userExists: async () => exists,
  };
  const account = createAccountService({ discogs, secretStore: ports.secretStore, profileStore: ports.profileStore, now: () => new Date('2026-10-02T00:00:00Z') });
  return { account, ports };
}

test('connectToken: mismatched identity is rejected and nothing is stored', async () => {
  const { account, ports } = setup({ identity: 'someone_else', profile: { discogsUsername: 'djuser' } });
  await assert.rejects(account.connectToken(TOKEN), e =>
    e.code === 'DISCOGS_TOKEN_MISMATCH' && /@someone_else, not @djuser/.test(e.message));
  assert.equal(ports.state.calls.secretSet, 0);
});

test('connectToken: matching identity stores once and exposes only last4', async () => {
  const { account, ports } = setup({ identity: 'DJUser', profile: { discogsUsername: 'djuser', firstName: 'Ana' } });
  const me = await account.connectToken(`  ${TOKEN.slice(0, 36)}WXYZ  `);
  assert.equal(ports.state.calls.secretSet, 1);
  assert.equal(me.discogs.last4, 'WXYZ');
  assert.equal(me.discogsUsername, 'DJUser'); // canonical capitalisation
  assert.equal(me.onboarded, true);
  assert.equal(me.discogs.verifiedAt, '2026-10-02T00:00:00.000Z');
  assert.ok(!JSON.stringify(me).includes(TOKEN.slice(0, 36)));
});

test('connectToken: malformed or rejected tokens', async () => {
  const { account } = setup({ profile: { discogsUsername: 'djuser' } });
  await assert.rejects(account.connectToken('short'), { code: 'VALIDATION' });
  await assert.rejects(account.connectToken('b'.repeat(40)), { code: 'DISCOGS_TOKEN_INVALID', status: 400 });
  const fresh = setup();
  await assert.rejects(fresh.account.connectToken(TOKEN), { code: 'NOT_ONBOARDED' });
});

test('saveProfile: unknown username rejected; changing username drops the old token', async () => {
  const missing = setup({ exists: false });
  await assert.rejects(missing.account.saveProfile({ firstName: '', discogsUsername: 'ghost' }), { code: 'VALIDATION' });

  const { account, ports } = setup({ profile: { discogsUsername: 'old', tokenVerifiedAt: 'x' } });
  ports.state.token = TOKEN;
  const me = await account.saveProfile({ firstName: 'Ana', discogsUsername: 'new_user' });
  assert.equal(ports.state.token, null);
  assert.equal(me.discogs.connected, false);
});
