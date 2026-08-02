import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import type { FirebaseConfig } from '../auth/types.ts';
import { createAuthorizeRouter } from './authorize.ts';
import { createOAuthStore, type OAuthStore } from './store.ts';
import { createTokenHandler } from './token.ts';

const firebase: FirebaseConfig = {
  apiKey: 'api-key',
  authDomain: 'project.firebaseapp.com',
  projectId: 'project',
  storageBucket: 'project.appspot.com',
  messagingSenderId: 'sender-id',
  appId: 'app-id',
};

const loginPageHtml = `
  <script>
    const firebaseConfig = __FIREBASE_CONFIG__;
    const state = __STATE__;
  </script>
`;

async function withListeningApp(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function firebaseIdToken(exp: number): string {
  return `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
}

describe('createAuthorizeRouter', () => {
  it('rejects an unknown client and an unregistered redirect URI', async () => {
    const store: OAuthStore = {
      saveClient() {},
      getClient(clientId) {
        return clientId === 'known-client'
          ? {
              clientId,
              redirectUris: ['http://127.0.0.1/registered'],
              tokenEndpointAuthMethod: 'none',
              createdAt: '2026-08-01T00:00:00.000Z',
            }
          : undefined;
      },
      saveAuthCode() {},
      consumeAuthCode() {
        return undefined;
      },
    };
    const app = express();
    app.use(createAuthorizeRouter({ store, firebase, loginPageHtml }));

    await withListeningApp(app, async (baseUrl) => {
      const unknownClient = await fetch(
        `${baseUrl}/authorize?response_type=code&client_id=missing&redirect_uri=http%3A%2F%2F127.0.0.1%2Fregistered&code_challenge=challenge&code_challenge_method=S256&state=state`,
      );
      assert.equal(unknownClient.status, 400);
      assert.deepEqual(await unknownClient.json(), {
        error: 'invalid_request',
        error_description: 'Unknown client_id',
      });

      const invalidRedirect = await fetch(
        `${baseUrl}/authorize?response_type=code&client_id=known-client&redirect_uri=http%3A%2F%2F127.0.0.1%2Funregistered&code_challenge=challenge&code_challenge_method=S256&state=state`,
      );
      assert.equal(invalidRedirect.status, 400);
      assert.deepEqual(await invalidRedirect.json(), {
        error: 'invalid_request',
        error_description: 'Invalid redirect_uri',
      });
    });
  });

  it('redirects request errors after validating the registered client', async () => {
    const store = createOAuthStore();
    store.saveClient({
      clientId: 'client-id',
      redirectUris: ['https://client.example/callback'],
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date().toISOString(),
    });
    const app = express();
    app.use(createAuthorizeRouter({ store, firebase, loginPageHtml }));

    await withListeningApp(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/authorize?${new URLSearchParams({
          response_type: 'token',
          client_id: 'client-id',
          redirect_uri: 'https://client.example/callback',
          code_challenge: 'challenge',
          code_challenge_method: 'S256',
          state: 'client-state',
        })}`,
        { redirect: 'manual' },
      );

      assert.equal(response.status, 302);
      const redirect = new URL(response.headers.get('location') ?? '');
      assert.equal(redirect.origin, 'https://client.example');
      assert.equal(redirect.searchParams.get('error'), 'invalid_request');
      assert.equal(redirect.searchParams.get('state'), 'client-state');
    });
  });

  it('allows authorization requests without state', async () => {
    const store = createOAuthStore();
    store.saveClient({
      clientId: 'client-id',
      redirectUris: ['https://client.example/callback'],
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date().toISOString(),
    });
    const app = express();
    app.use(createAuthorizeRouter({ store, firebase, loginPageHtml }));

    await withListeningApp(app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: 'client-id',
          redirect_uri: 'https://client.example/callback',
          code_challenge: 'challenge',
          code_challenge_method: 'S256',
        })}`,
      );

      assert.equal(response.status, 200);
    });
  });

  it('issues a one-time code after verifying the Firebase ID token', async () => {
    const store = createOAuthStore();
    const verifier = 'verifier';
    const idToken = 'signed-firebase-id-token';
    const verifiedExpiresAt = Math.floor(Date.now() / 1000) + 900;
    let verifiedToken: string | undefined;
    store.saveClient({
      clientId: 'client-id',
      redirectUris: ['http://127.0.0.1/callback?existing=value'],
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date().toISOString(),
    });
    const app = express();
    app.use(
      createAuthorizeRouter({
        store,
        firebase,
        loginPageHtml,
        verifyIdToken: async (token) => {
          verifiedToken = token;
          return {
            idToken: token,
            uid: 'verified-user-id',
            exp: verifiedExpiresAt,
          };
        },
      }),
    );
    app.post(
      '/token',
      express.urlencoded({ extended: false }),
      createTokenHandler({ store, firebaseApiKey: firebase.apiKey }),
    );

    await withListeningApp(app, async (baseUrl) => {
      const authorize = await fetch(
        `${baseUrl}/authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: 'client-id',
          redirect_uri: 'http://127.0.0.1/callback?existing=value',
          code_challenge: s256(verifier),
          code_challenge_method: 'S256',
          state: 'client-state',
        })}`,
      );
      assert.equal(authorize.status, 200);
      const html = await authorize.text();
      const loginState = html.match(/const state = "([^"]+)";/)?.[1];
      assert.ok(loginState);
      assert.match(html, /"apiKey":"api-key"/);

      const callback = await fetch(`${baseUrl}/authorize/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: loginState,
          idToken,
          refreshToken: 'firebase-refresh-token',
          uid: 'untrusted-user-id',
        }),
      });
      assert.equal(callback.status, 200);
      assert.equal(verifiedToken, idToken);
      const { redirect_to: redirectTo } = (await callback.json()) as {
        redirect_to: string;
      };
      const callbackUrl = new URL(redirectTo);
      assert.equal(callbackUrl.origin, 'http://127.0.0.1');
      assert.equal(callbackUrl.pathname, '/callback');
      assert.equal(callbackUrl.searchParams.get('existing'), 'value');
      assert.equal(callbackUrl.searchParams.get('state'), 'client-state');
      const code = callbackUrl.searchParams.get('code');
      assert.ok(code);

      const token = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'http://127.0.0.1/callback?existing=value',
          client_id: 'client-id',
          code_verifier: verifier,
        }),
      });
      assert.equal(token.status, 200);
      const tokenBody = (await token.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
      };
      assert.equal(tokenBody.access_token, idToken);
      assert.equal(tokenBody.token_type, 'Bearer');
      assert.ok(tokenBody.expires_in > 0 && tokenBody.expires_in <= 900);
      assert.equal(tokenBody.refresh_token, 'firebase-refresh-token');

      const replay = await fetch(`${baseUrl}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: 'http://127.0.0.1/callback?existing=value',
          client_id: 'client-id',
          code_verifier: verifier,
        }),
      });
      assert.equal(replay.status, 400);
      assert.deepEqual(await replay.json(), {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code or PKCE verifier',
      });
    });
  });
});
