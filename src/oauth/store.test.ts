import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthStore } from './store.ts';
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
  it('save/get client round-trip', () => {
    const store = createOAuthStore();
    store.saveClient(sampleClient);
    assert.deepEqual(store.getClient('client-1'), sampleClient);
    assert.equal(store.getClient('missing'), undefined);
  });

  it('saveAuthCode sets expiry from codeTtlMs', () => {
    let currentTime = 1000;
    const store = createOAuthStore({
      now: () => currentTime,
      codeTtlMs: 60_000,
    });
    store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const consumed = store.consumeAuthCode('code-1');
    assert.deepEqual(consumed, {
      ...sampleAuthCodeRecord(),
      expiresAtMs: 61_000,
    });
  });

  it('consumeAuthCode returns record once then undefined', () => {
    let currentTime = 1000;
    const store = createOAuthStore({
      now: () => currentTime,
      codeTtlMs: 120_000,
    });
    store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const record = store.consumeAuthCode('code-1');
    assert.equal(record?.clientId, 'client-1');
    assert.equal(store.consumeAuthCode('code-1'), undefined);
  });

  it('consumeAuthCode returns undefined when expired', () => {
    let currentTime = 1000;
    const store = createOAuthStore({
      now: () => currentTime,
      codeTtlMs: 120_000,
    });
    store.saveAuthCode('code-1', sampleAuthCodeRecord());
    currentTime = 1000 + 120_001;
    assert.equal(store.consumeAuthCode('code-1'), undefined);
  });

  it('consumeAuthCode returns undefined when missing', () => {
    const store = createOAuthStore();
    assert.equal(store.consumeAuthCode('missing'), undefined);
  });

  it('defaults codeTtlMs to 120_000', () => {
    let currentTime = 5000;
    const store = createOAuthStore({ now: () => currentTime });
    store.saveAuthCode('code-1', sampleAuthCodeRecord());
    const record = store.consumeAuthCode('code-1');
    assert.equal(record?.expiresAtMs, 125_000);
  });
});
