import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BearerTokenProvider } from './bearer-token-provider.ts';

describe('BearerTokenProvider', () => {
  it('returns the request token and uid', async () => {
    const provider = new BearerTokenProvider({
      uid: 'u1',
      idToken: 'tok',
    });
    assert.equal(await provider.getIdToken(), 'tok');
    assert.equal(await provider.getUid(), 'u1');
    assert.deepEqual(await provider.getProfile(), {
      uid: 'u1',
      email: null,
      displayName: null,
    });
  });

  it('clearCache is a no-op', async () => {
    const provider = new BearerTokenProvider({
      uid: 'u1',
      idToken: 'tok',
    });
    provider.clearCache();
    assert.equal(await provider.getIdToken(), 'tok');
  });
});
