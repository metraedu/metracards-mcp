import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOAuthStoreFromEnv } from './create-store.ts';

describe('createOAuthStoreFromEnv', () => {
  it('uses an in-memory store when no table is configured', async () => {
    const store = createOAuthStoreFromEnv({});
    const client = {
      clientId: 'client-1',
      redirectUris: ['https://example.com/callback'],
      tokenEndpointAuthMethod: 'none' as const,
      createdAt: '2026-08-02T00:00:00.000Z',
    };

    await store.saveClient(client);

    assert.deepEqual(await store.getClient(client.clientId), client);
  });

  it('uses an in-memory store when the table configuration is blank', async () => {
    const store = createOAuthStoreFromEnv({
      METRACARDS_MCP_OAUTH_TABLE: '   ',
    });
    const client = {
      clientId: 'client-1',
      redirectUris: ['https://example.com/callback'],
      tokenEndpointAuthMethod: 'none' as const,
      createdAt: '2026-08-02T00:00:00.000Z',
    };

    await store.saveClient(client);

    assert.deepEqual(await store.getClient(client.clientId), client);
  });
});
