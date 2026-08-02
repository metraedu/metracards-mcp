#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth,
  type OAuthTokenVerifier,
} from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import cors from 'cors';
import express from 'express';
import {
  createMcpHandler,
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from '@modelcontextprotocol/server';
import {
  FirebaseJwtError,
  verifyFirebaseIdToken,
} from './auth/firebase-jwt.js';
import { CredentialStore } from './auth/credential-store.js';
import { BearerTokenProvider } from './auth/bearer-token-provider.js';
import { MetraCardsApiClient } from './clients/metracards-api.js';
import { config } from './config/index.js';
import { createAuthorizeRouter } from './oauth/authorize.js';
import { createDcrRouter } from './oauth/dcr.js';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from './oauth/metadata.js';
import { createOAuthStore } from './oauth/store.js';
import { createTokenHandler } from './oauth/token.js';
import { createServer } from './server/create-server.js';

if (!config.firebase) {
  console.error(
    'Complete Firebase web configuration is required to start the HTTP transport.',
  );
  process.exit(1);
}

const projectId =
  config.firebase?.projectId?.trim() ||
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  '';

if (!projectId) {
  console.error(
    'FIREBASE_PROJECT_ID is required to start the HTTP transport (JWT audience).',
  );
  process.exit(1);
}

const resourceUrl = new URL(config.http.resourceUrl);
const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
const prmPath = new URL(resourceMetadataUrl).pathname;
const oauthStore = createOAuthStore();
const authorizationServerMetadata = buildAuthorizationServerMetadata(
  config.http.issuerUrl,
);
const protectedResourceMetadata = buildProtectedResourceMetadata(
  resourceUrl.toString(),
  config.http.authServers.length > 0
    ? config.http.authServers
    : [config.http.issuerUrl],
);
const here = path.dirname(fileURLToPath(import.meta.url));
const loginPageHtml = readFileSync(
  path.join(here, 'auth', 'oauth-login-page.html'),
  'utf8',
);

const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const verified = await verifyFirebaseIdToken(token, projectId);
      return {
        token: verified.idToken,
        clientId: verified.uid,
        scopes: ['openid'],
        expiresAt: verified.exp,
        extra: { uid: verified.uid },
      };
    } catch (err) {
      const message =
        err instanceof FirebaseJwtError || err instanceof Error
          ? err.message
          : String(err);
      throw new OAuthError(OAuthErrorCode.InvalidToken, message);
    }
  },
};

const auth = requireBearerAuth({
  verifier,
  resourceMetadataUrl,
});

const mcpHandler = createMcpHandler(({ authInfo }) => {
  if (!authInfo) {
    throw new Error('Missing authInfo for MCP request');
  }
  const store = new CredentialStore(config.credentialsPath);
  const tokenProvider = new BearerTokenProvider({
    uid: authInfo.clientId,
    idToken: authInfo.token,
  });
  const client = new MetraCardsApiClient(config.apiUrl, tokenProvider);
  return createServer({ store, tokenProvider, client });
});

const nodeHandler = toNodeHandler(mcpHandler, {
  onerror: (error) => {
    console.error('MCP HTTP handler error:', error.message);
  },
});

const app = createMcpExpressApp({
  host: config.http.host,
  allowedHosts: config.http.allowedHosts,
});

app.options(['/.well-known/oauth-protected-resource', prmPath], cors());
app.get(
  ['/.well-known/oauth-protected-resource', prmPath],
  cors(),
  (_req, res) => {
    res.json(protectedResourceMetadata);
  },
);
app.options('/.well-known/oauth-authorization-server', cors());
app.get(
  '/.well-known/oauth-authorization-server',
  cors(),
  (_req, res) => {
    res.json(authorizationServerMetadata);
  },
);
app.use(createDcrRouter(oauthStore));
app.use(
  createAuthorizeRouter({
    store: oauthStore,
    firebase: config.firebase,
    loginPageHtml,
    verifyIdToken: verifyFirebaseIdToken,
  }),
);
app.options('/token', cors());
app.post(
  '/token',
  cors(),
  express.urlencoded({ extended: false }),
  express.json(),
  createTokenHandler({
    store: oauthStore,
    firebaseApiKey: config.firebase.apiKey,
  }),
);

app.all('/mcp', auth, (req, res) => {
  void nodeHandler(req, res, req.body);
});

const server = app.listen(config.http.port, config.http.host, () => {
  console.error(
    `metracards-mcp HTTP listening on http://${config.http.host}:${config.http.port}/mcp (resource=${resourceUrl})`,
  );
});

function shutdown(signal: string): void {
  console.error(`Received ${signal}, shutting down HTTP MCP…`);
  void mcpHandler
    .close()
    .catch((err: unknown) => {
      console.error('Error closing MCP handler:', err);
    })
    .finally(() => {
      server.close(() => process.exit(0));
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
