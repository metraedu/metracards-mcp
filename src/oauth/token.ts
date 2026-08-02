import type { RequestHandler, Response } from 'express';
import { refreshFirebaseIdToken } from './firebase-refresh.ts';
import { verifyS256 } from './pkce.ts';
import type { OAuthStore } from './store.ts';

type TokenRequestBody = {
  grant_type?: unknown;
  code?: unknown;
  redirect_uri?: unknown;
  client_id?: unknown;
  code_verifier?: unknown;
  refresh_token?: unknown;
};

type TokenHandlerDependencies = {
  store: OAuthStore;
  firebaseApiKey: string;
  fetchImpl?: typeof fetch;
};

function oauthError(
  res: Response,
  error: 'invalid_grant' | 'invalid_request' | 'unsupported_grant_type',
  description: string,
): void {
  res.status(400).json({
    error,
    error_description: description,
  });
}

function getBodyString(
  body: TokenRequestBody,
  field: keyof TokenRequestBody,
): string | undefined {
  const value = body[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createTokenHandler(
  deps: TokenHandlerDependencies,
): RequestHandler {
  return async (req, res) => {
    const body = (req.body ?? {}) as TokenRequestBody;
    const grantType = getBodyString(body, 'grant_type');

    if (grantType === 'authorization_code') {
      const code = getBodyString(body, 'code');
      const redirectUri = getBodyString(body, 'redirect_uri');
      const clientId = getBodyString(body, 'client_id');
      const codeVerifier = getBodyString(body, 'code_verifier');

      if (!code || !redirectUri || !clientId || !codeVerifier) {
        oauthError(res, 'invalid_request', 'Missing authorization code parameters');
        return;
      }

      const record = await deps.store.consumeAuthCode(code);
      if (
        !record ||
        record.clientId !== clientId ||
        record.redirectUri !== redirectUri ||
        !verifyS256(codeVerifier, record.codeChallenge)
      ) {
        oauthError(res, 'invalid_grant', 'Invalid authorization code or PKCE verifier');
        return;
      }

      const expiresInSec = Math.max(
        0,
        record.idTokenExpiresAtSec - Math.floor(Date.now() / 1000),
      );
      res.set('Cache-Control', 'no-store').json({
        access_token: record.idToken,
        token_type: 'Bearer',
        expires_in: expiresInSec,
        ...(record.refreshToken
          ? { refresh_token: record.refreshToken }
          : {}),
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = getBodyString(body, 'refresh_token');
      if (!refreshToken) {
        oauthError(res, 'invalid_request', 'refresh_token is required');
        return;
      }

      try {
        const refreshed = await refreshFirebaseIdToken(
          deps.firebaseApiKey,
          refreshToken,
          deps.fetchImpl,
        );
        res.set('Cache-Control', 'no-store').json({
          access_token: refreshed.idToken,
          token_type: 'Bearer',
          expires_in: refreshed.expiresInSec,
          ...(refreshed.refreshToken !== refreshToken
            ? { refresh_token: refreshed.refreshToken }
            : {}),
        });
      } catch {
        oauthError(res, 'invalid_grant', 'Invalid Firebase refresh token');
      }
      return;
    }

    if (!grantType) {
      oauthError(res, 'invalid_request', 'grant_type is required');
      return;
    }

    oauthError(res, 'unsupported_grant_type', 'Unsupported grant_type');
  };
}
