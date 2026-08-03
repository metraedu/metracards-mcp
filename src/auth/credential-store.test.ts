import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CredentialStore } from './credential-store.ts';
import type { StoredCredentials } from './types.ts';

describe('CredentialStore', () => {
  it('returns null when file is missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-creds-'));
    const store = new CredentialStore(path.join(dir, 'credentials.json'));
    assert.equal(await store.load(), null);
  });

  it('round-trips credentials and sets mode 0600', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-creds-'));
    const filePath = path.join(dir, 'credentials.json');
    const store = new CredentialStore(filePath);
    const creds: StoredCredentials = {
      refreshToken: 'refresh-abc',
      uid: 'uid-1',
      email: 'a@b.com',
      displayName: 'Ada',
      photoURL: null,
      provider: 'google',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };

    await store.save(creds);
    assert.deepEqual(await store.load(), creds);

    const mode = (await stat(filePath)).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it('clear removes the file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-creds-'));
    const filePath = path.join(dir, 'credentials.json');
    const store = new CredentialStore(filePath);
    await store.save({
      refreshToken: 'r',
      uid: 'u',
      email: null,
      displayName: null,
      photoURL: null,
      provider: 'apple',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    await store.clear();
    assert.equal(await store.load(), null);
  });
});
