import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { isAllowedRedirectUri } from './redirect-uri.ts';
import type { OAuthStore, RegisteredClient } from './store.ts';

type DcrRequestBody = {
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
};

function invalidRequest(res: express.Response, description: string): void {
  res.status(400).json({
    error: 'invalid_request',
    error_description: description,
  });
}

export function createDcrRouter(store: OAuthStore): express.Router {
  const router = express.Router();

  router.use('/register', cors());
  router.post('/register', express.json(), (req, res) => {
    const body = req.body as DcrRequestBody;

    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
      invalidRequest(res, 'redirect_uris is required and must be a non-empty array');
      return;
    }

    const redirectUris = body.redirect_uris.filter(
      (uri): uri is string => typeof uri === 'string' && uri.length > 0,
    );
    if (redirectUris.length !== body.redirect_uris.length) {
      invalidRequest(res, 'redirect_uris must contain non-empty strings');
      return;
    }
    if (!redirectUris.every(isAllowedRedirectUri)) {
      invalidRequest(
        res,
        'redirect_uris must use http or https and must not contain fragments',
      );
      return;
    }

    const authMethod = body.token_endpoint_auth_method ?? 'none';
    if (authMethod !== 'none') {
      invalidRequest(
        res,
        'token_endpoint_auth_method must be none for public clients',
      );
      return;
    }

    const clientId = randomUUID();
    const client: RegisteredClient = {
      clientId,
      redirectUris,
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date().toISOString(),
    };

    store.saveClient(client);

    res.status(201).json({
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
    });
  });

  return router;
}
