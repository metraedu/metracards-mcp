import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createDcrRouter } from './dcr.ts';
import { createMemoryOAuthStore } from './store.ts';

async function withListeningApp(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('createDcrRouter', () => {
  it('registers client and persists in store', async () => {
    const store = createMemoryOAuthStore();
    const app = express();
    app.use(createDcrRouter(store));

    await withListeningApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://127.0.0.1:54321/callback'],
          token_endpoint_auth_method: 'none',
          client_name: 'test',
        }),
      });

      assert.equal(response.status, 201);
      const body = (await response.json()) as {
        client_id: string;
        redirect_uris: string[];
        token_endpoint_auth_method: string;
      };
      assert.match(body.client_id, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(body.redirect_uris, [
        'http://127.0.0.1:54321/callback',
      ]);
      assert.equal(body.token_endpoint_auth_method, 'none');

      const saved = await store.getClient(body.client_id);
      assert.ok(saved);
      assert.equal(saved.clientId, body.client_id);
      assert.deepEqual(saved.redirectUris, body.redirect_uris);
      assert.equal(saved.tokenEndpointAuthMethod, 'none');
      assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('rejects empty redirect_uris with 400 OAuth error', async () => {
    const store = createMemoryOAuthStore();
    const app = express();
    app.use(createDcrRouter(store));

    await withListeningApp(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: [],
          token_endpoint_auth_method: 'none',
        }),
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as {
        error: string;
        error_description: string;
      };
      assert.equal(body.error, 'invalid_request');
      assert.ok(body.error_description.length > 0);
    });
  });

  it('rejects redirect URIs without HTTP(S) schemes or with fragments', async () => {
    const store = createMemoryOAuthStore();
    const app = express();
    app.use(createDcrRouter(store));

    await withListeningApp(app, async (baseUrl) => {
      for (const redirectUri of [
        'javascript:alert(1)',
        'data:text/html,malicious',
        'https://client.example/callback#fragment',
      ]) {
        const response = await fetch(`${baseUrl}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirect_uris: [redirectUri] }),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: 'invalid_request',
          error_description:
            'redirect_uris must use http or https and must not contain fragments',
        });
      }
    });
  });
});
