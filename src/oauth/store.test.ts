import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryOAuthStore } from './store.ts';
import type { AuthCodeRecord, RegisteredClient } from './store.ts';

const sampleClient: RegisteredClient = {
  clientId: 'client-1',
  redirectUris: ['https://example.com/callback'],
  tokenEndpointAuthMethod: 'none',
  createdAt: '2026-08-01T00:00:00.000Z',
};

function sampleAuthCodeRecord(expiresAtMs = 0): AuthCodeRecord {
  return {
    clientId: 'client-1',
    redirectUri: 'https://example.com/callback',
    codeChallenge: 'challenge',
    codeChallengeMethod: 'S256',
    uid: 'uid-1',
    idToken: 'id-token',
    refreshToken: 'refresh-token',
    idTokenExpiresAtSec: 1_700_000_000,
    expiresAtMs,
  };
}

describe('OAuthStore', () => {
  it('save/get client round-trip', async () => {
    const store = createMemoryOAuthStore();
    await store.saveClient(sampleClient);
    assert.deepEqual(await store.getClient('client-1'), sampleClient);
    assert.equal(await store.getClient('missing'), undefined);
  });

  it('saveAuthCode sets expiry from codeTtlMs', async () => {
    let currentTime = 1000;
    const store = createMemoryOAuthStore({
      now: () => currentTime,
      codeTtlMs: 60_000,
    });
    await store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const consumed = await store.consumeAuthCode('code-1');
    assert.deepEqual(consumed, {
      ...sampleAuthCodeRecord(),
      expiresAtMs: 61_000,
    });
  });

  it('consumeAuthCode returns record once then undefined', async () => {
    let currentTime = 1000;
    const store = createMemoryOAuthStore({
      now: () => currentTime,
      codeTtlMs: 120_000,
    });
    await store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const record = await store.consumeAuthCode('code-1');
    assert.equal(record?.clientId, 'client-1');
    assert.equal(await store.consumeAuthCode('code-1'), undefined);
  });

  it('consumeAuthCode returns undefined when expired', async () => {
    let currentTime = 1000;
    const store = createMemoryOAuthStore({
      now: () => currentTime,
      codeTtlMs: 120_000,
    });
    await store.saveAuthCode('code-1', sampleAuthCodeRecord());
    currentTime = 1000 + 120_001;
    assert.equal(await store.consumeAuthCode('code-1'), undefined);
  });

  it('consumeAuthCode returns undefined when missing', async () => {
    const store = createMemoryOAuthStore();
    assert.equal(await store.consumeAuthCode('missing'), undefined);
  });

  it('defaults codeTtlMs to 120_000', async () => {
    let currentTime = 5000;
    const store = createMemoryOAuthStore({ now: () => currentTime });
    await store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const record = await store.consumeAuthCode('code-1');
    assert.equal(record?.expiresAtMs, 125_000);
  });

  it('consumes pending authorize once within TTL', async () => {
    let nowMs = 1_000;
    const store = createMemoryOAuthStore({
      pendingTtlMs: 100,
      now: () => nowMs,
    });
    await store.savePendingAuthorize('login-1', {
      clientId: 'c1',
      redirectUri: 'https://client.example/cb',
      codeChallenge: 'challenge',
      state: 's',
      createdAtMs: nowMs,
    });
    const first = await store.consumePendingAuthorize('login-1');
    assert.equal(first?.clientId, 'c1');
    assert.equal(await store.consumePendingAuthorize('login-1'), undefined);
  });

  it('rejects expired pending authorize', async () => {
    let nowMs = 1_000;
    const store = createMemoryOAuthStore({
      pendingTtlMs: 50,
      now: () => nowMs,
    });
    await store.savePendingAuthorize('login-2', {
      clientId: 'c1',
      redirectUri: 'https://client.example/cb',
      codeChallenge: 'challenge',
      createdAtMs: nowMs,
    });
    nowMs = 1_100;
    assert.equal(await store.consumePendingAuthorize('login-2'), undefined);
  });
});
