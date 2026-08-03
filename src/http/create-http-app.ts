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
} from '../auth/firebase-jwt.js';
import { BearerTokenProvider } from '../auth/bearer-token-provider.js';
import { CredentialStore } from '../auth/credential-store.js';
import { MetraCardsApiClient } from '../clients/metracards-api.js';
import type { AppConfig } from '../config/index.js';
import { createAuthorizeRouter } from '../oauth/authorize.js';
import { createDcrRouter } from '../oauth/dcr.js';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
} from '../oauth/metadata.js';
import type { OAuthStore } from '../oauth/store.js';
import { createTokenHandler } from '../oauth/token.js';
import { createServer } from '../server/create-server.js';

export type CreateHttpAppDeps = {
  config: AppConfig;
  oauthStore: OAuthStore;
  projectId: string;
  loginPageHtml: string;
};

export type HttpApp = {
  app: express.Express;
  close(): Promise<void>;
};

export function createHttpApp(deps: CreateHttpAppDeps): HttpApp {
  const firebase = deps.config.firebase;
  const resourceUrl = new URL(deps.config.http.resourceUrl);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceUrl);
  const prmPath = new URL(resourceMetadataUrl).pathname;
  const authorizationServerMetadata = buildAuthorizationServerMetadata(
    deps.config.http.issuerUrl,
  );
  const protectedResourceMetadata = buildProtectedResourceMetadata(
    resourceUrl.toString(),
    deps.config.http.authServers.length > 0
      ? deps.config.http.authServers
      : [deps.config.http.issuerUrl],
  );
  const verifier: OAuthTokenVerifier = {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const verified = await verifyFirebaseIdToken(token, deps.projectId);
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
    const store = new CredentialStore(deps.config.credentialsPath);
    const tokenProvider = new BearerTokenProvider({
      uid: authInfo.clientId,
      idToken: authInfo.token,
    });
    const client = new MetraCardsApiClient(deps.config.apiUrl, tokenProvider);
    return createServer({ store, tokenProvider, client });
  });
  const nodeHandler = toNodeHandler(mcpHandler, {
    onerror: (error) => {
      console.error('MCP HTTP handler error:', error.message);
    },
  });
  const app = createMcpExpressApp({
    host: deps.config.http.host,
    allowedHosts: deps.config.http.allowedHosts,
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
  app.use(createDcrRouter(deps.oauthStore));
  app.use(
    createAuthorizeRouter({
      store: deps.oauthStore,
      firebase,
      loginPageHtml: deps.loginPageHtml,
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
      store: deps.oauthStore,
      firebaseApiKey: firebase.apiKey,
    }),
  );
  app.all('/mcp', auth, (req, res) => {
    void nodeHandler(req, res, req.body);
  });

  return {
    app,
    async close() {
      await mcpHandler.close();
    },
  };
}
