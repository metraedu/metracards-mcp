#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { CredentialStore } from './auth/credential-store.js';
import { RefreshingTokenProvider } from './auth/refreshing-token-provider.js';
import { MetraCardsApiClient } from './clients/metracards-api.js';
import { config } from './config/index.js';
import { createServer } from './server/create-server.js';

console.error(`metracards-mcp listening on stdio (API: ${config.apiUrl})`);

serveStdio(() => {
  const store = new CredentialStore(config.credentialsPath);
  const tokenProvider = new RefreshingTokenProvider(
    store,
    config.firebase?.apiKey ?? '',
  );
  const client = new MetraCardsApiClient(config.apiUrl, tokenProvider);
  return createServer({ store, tokenProvider, client });
});
