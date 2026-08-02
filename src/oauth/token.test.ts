import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { createTokenHandler } from './token.ts';
import { createOAuthStore } from './store.ts';

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

function createApp(
  store: ReturnType<typeof createOAuthStore>,
  fetchImpl?: typeof fetch,
): express.Express {
  const app = express();
  app.post(
    '/token',
    express.urlencoded({ extended: false }),
    express.json(),
    createTokenHandler({
      store,
      firebaseApiKey: 'firebase-api-key',
      fetchImpl,
    }),
  );
  return app;
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('createTokenHandler', () => {
  it('exchanges a verified authorization code for its Firebase tokens', async () => {
    const store = createOAuthStore();
    const verifier = 'verifier';
    store.saveAuthCode('authorization-code', {
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1/callback',
      codeChallenge: s256(verifier),
      codeChallengeMethod: 'S256',
      uid: 'user-id',
      idToken: 'firebase-id-token',
      refreshToken: 'firebase-refresh-token',
      idTokenExpiresAtSec: Math.floor(Date.now() / 1000) + 900,
      expiresAtMs: 0,
    });

    await withListeningApp(createApp(store), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'authorization-code',
          redirect_uri: 'http://127.0.0.1/callback',
          client_id: 'client-id',
          code_verifier: verifier,
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
      };
      assert.equal(body.access_token, 'firebase-id-token');
      assert.equal(body.token_type, 'Bearer');
      assert.ok(body.expires_in > 0 && body.expires_in <= 900);
      assert.equal(body.refresh_token, 'firebase-refresh-token');
    });
  });

  it('rejects an authorization code with an invalid PKCE verifier', async () => {
    const store = createOAuthStore();
    store.saveAuthCode('authorization-code', {
      clientId: 'client-id',
      redirectUri: 'http://127.0.0.1/callback',
      codeChallenge: s256('correct-verifier'),
      codeChallengeMethod: 'S256',
      uid: 'user-id',
      idToken: 'firebase-id-token',
      refreshToken: null,
      idTokenExpiresAtSec: Math.floor(Date.now() / 1000) + 900,
      expiresAtMs: 0,
    });

    await withListeningApp(createApp(store), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: 'authorization-code',
          redirect_uri: 'http://127.0.0.1/callback',
          client_id: 'client-id',
          code_verifier: 'wrong-verifier',
        }),
      });

      assert.equal(response.status, 400);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, 'invalid_grant');
    });
  });

  it('exchanges a Firebase refresh token for a refreshed ID token', async () => {
    const store = createOAuthStore();
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.equal(
        input,
        'https://securetoken.googleapis.com/v1/token?key=firebase-api-key',
      );
      assert.equal(init?.method, 'POST');
      assert.equal(
        (init?.body as URLSearchParams).toString(),
        'grant_type=refresh_token&refresh_token=firebase-refresh-token',
      );
      return new Response(
        JSON.stringify({
          id_token: 'refreshed-firebase-id-token',
          refresh_token: 'rotated-firebase-refresh-token',
          expires_in: '3600',
        }),
        { status: 200 },
      );
    };

    await withListeningApp(createApp(store, fetchImpl), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: 'firebase-refresh-token',
        }),
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {
        access_token: 'refreshed-firebase-id-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'rotated-firebase-refresh-token',
      });
    });
  });
});
