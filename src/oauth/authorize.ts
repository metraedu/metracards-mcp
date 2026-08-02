import { randomUUID } from 'node:crypto';
import { json, Router, type Response } from 'express';
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseIdToken,
} from '../auth/firebase-jwt.ts';
import type { FirebaseConfig } from '../auth/types.ts';
import { isAllowedRedirectUri } from './redirect-uri.ts';
import type { OAuthStore } from './store.ts';

type AuthorizeRouterDependencies = {
  store: OAuthStore;
  firebase: FirebaseConfig;
  loginPageHtml: string;
  verifyIdToken?: (
    token: string,
    projectId: string,
  ) => Promise<VerifiedFirebaseIdToken>;
  now?: () => number;
  pendingTtlMs?: number;
};

type PendingAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  createdAtMs: number;
};

type AuthorizeQuery = {
  response_type?: unknown;
  client_id?: unknown;
  redirect_uri?: unknown;
  code_challenge?: unknown;
  code_challenge_method?: unknown;
  state?: unknown;
};

type CallbackBody = {
  state?: unknown;
  idToken?: unknown;
  refreshToken?: unknown;
};

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function invalidRequest(
  res: Response,
  description: string,
): void {
  res.status(400).json({
    error: 'invalid_request',
    error_description: description,
  });
}

function redirectAuthorizationError(
  res: Response,
  redirectUri: string,
  state: string | undefined,
  description: string,
): void {
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('error', 'invalid_request');
  redirectUrl.searchParams.set('error_description', description);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }
  res.redirect(redirectUrl.toString());
}

function renderLoginPage(
  html: string,
  firebase: FirebaseConfig,
  loginState: string,
): string {
  return html
    .replace('__FIREBASE_CONFIG__', JSON.stringify(firebase))
    .replace('__STATE__', JSON.stringify(loginState))
    .replace('__PROVIDER__', 'null');
}

export function createAuthorizeRouter(
  deps: AuthorizeRouterDependencies,
): Router {
  const router = Router();
  const pendingRequests = new Map<string, PendingAuthorizeRequest>();
  const now = deps.now ?? (() => Date.now());
  const pendingTtlMs = deps.pendingTtlMs ?? 600_000;
  const verifyIdToken = deps.verifyIdToken ?? verifyFirebaseIdToken;

  function getPendingRequest(
    loginState: string,
  ): PendingAuthorizeRequest | undefined {
    const pending = pendingRequests.get(loginState);
    if (!pending) {
      return undefined;
    }
    pendingRequests.delete(loginState);
    return pending.createdAtMs + pendingTtlMs > now() ? pending : undefined;
  }

  router.get('/authorize', (req, res) => {
    const query = req.query as AuthorizeQuery;
    const responseType = getString(query.response_type);
    const clientId = getString(query.client_id);
    const redirectUri = getString(query.redirect_uri);
    const codeChallenge = getString(query.code_challenge);
    const codeChallengeMethod = getString(query.code_challenge_method);
    const state = getString(query.state);

    const client = clientId ? deps.store.getClient(clientId) : undefined;
    if (!client || !clientId) {
      invalidRequest(res, 'Unknown client_id');
      return;
    }
    if (
      !redirectUri ||
      !isAllowedRedirectUri(redirectUri) ||
      !client.redirectUris.includes(redirectUri)
    ) {
      invalidRequest(res, 'Invalid redirect_uri');
      return;
    }
    if (
      responseType !== 'code' ||
      !codeChallenge ||
      codeChallengeMethod !== 'S256'
    ) {
      redirectAuthorizationError(
        res,
        redirectUri,
        state,
        'Invalid authorization request',
      );
      return;
    }

    const loginState = randomUUID();
    pendingRequests.set(loginState, {
      clientId,
      redirectUri,
      codeChallenge,
      state,
      createdAtMs: now(),
    });
    res
      .type('html')
      .send(renderLoginPage(deps.loginPageHtml, deps.firebase, loginState));
  });

  router.post('/authorize/callback', json(), async (req, res) => {
    const body = (req.body ?? {}) as CallbackBody;
    const loginState = getString(body.state);
    const idToken = getString(body.idToken);
    const refreshToken = getString(body.refreshToken);

    if (!loginState || !idToken) {
      invalidRequest(res, 'Invalid callback payload');
      return;
    }

    const pending = getPendingRequest(loginState);
    if (!pending) {
      invalidRequest(res, 'Invalid login state');
      return;
    }
    if (!isAllowedRedirectUri(pending.redirectUri)) {
      invalidRequest(res, 'Invalid redirect_uri');
      return;
    }

    let verified: VerifiedFirebaseIdToken;
    try {
      verified = await verifyIdToken(idToken, deps.firebase.projectId);
    } catch {
      invalidRequest(res, 'Invalid Firebase ID token');
      return;
    }

    const code = randomUUID();
    deps.store.saveAuthCode(code, {
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: 'S256',
      uid: verified.uid,
      idToken: verified.idToken,
      refreshToken: refreshToken ?? null,
      idTokenExpiresAtSec: verified.exp,
      expiresAtMs: 0,
    });

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) {
      redirectUrl.searchParams.set('state', pending.state);
    }
    res.json({ redirect_to: redirectUrl.toString() });
  });

  return router;
}
