import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CredentialStore } from './credential-store.ts';
import {
  AuthRequiredError,
  RefreshingTokenProvider,
} from './refreshing-token-provider.ts';

describe('RefreshingTokenProvider', () => {
  it('throws AuthRequiredError when credentials are missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-token-'));
    const store = new CredentialStore(path.join(dir, 'credentials.json'));
    const provider = new RefreshingTokenProvider(store, 'api-key', async () => {
      throw new Error('should not fetch');
    });

    await assert.rejects(() => provider.getIdToken(), AuthRequiredError);
    await assert.rejects(() => provider.getUid(), AuthRequiredError);
    assert.equal(await provider.getProfile(), null);
    assert.equal(provider.canPersistCredentials, true);
  });

  it('getUid returns stored uid', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-token-'));
    const store = new CredentialStore(path.join(dir, 'credentials.json'));
    await store.save({
      refreshToken: 'refresh-1',
      uid: 'uid-1',
      email: 'a@b.c',
      displayName: 'Ada',
      photoURL: null,
      provider: 'google',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    const provider = new RefreshingTokenProvider(store, 'api-key', async () => {
      throw new Error('should not fetch');
    });

    assert.equal(await provider.getUid(), 'uid-1');
    assert.deepEqual(await provider.getProfile(), {
      uid: 'uid-1',
      email: 'a@b.c',
      displayName: 'Ada',
      provider: 'google',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('refreshes and caches the id token', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-token-'));
    const store = new CredentialStore(path.join(dir, 'credentials.json'));
    await store.save({
      refreshToken: 'refresh-1',
      uid: 'uid-1',
      email: null,
      displayName: null,
      photoURL: null,
      provider: 'google',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    let fetchCount = 0;
    const provider = new RefreshingTokenProvider(store, 'api-key', async () => {
      fetchCount += 1;
      return new Response(
        JSON.stringify({
          id_token: 'id-token-1',
          expires_in: '3600',
          refresh_token: 'refresh-1',
        }),
        { status: 200 },
      );
    });

    assert.equal(await provider.getIdToken(), 'id-token-1');
    assert.equal(await provider.getIdToken(), 'id-token-1');
    assert.equal(fetchCount, 1);
  });

  it('clears store when refresh fails', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-token-'));
    const store = new CredentialStore(path.join(dir, 'credentials.json'));
    await store.save({
      refreshToken: 'bad',
      uid: 'uid-1',
      email: null,
      displayName: null,
      photoURL: null,
      provider: 'google',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });

    const provider = new RefreshingTokenProvider(store, 'api-key', async () =>
      new Response(JSON.stringify({ error: 'invalid' }), { status: 400 }),
    );

    await assert.rejects(() => provider.getIdToken(), AuthRequiredError);
    assert.equal(await store.load(), null);
  });
});
