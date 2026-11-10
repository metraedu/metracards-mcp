#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { CredentialStore } from './auth/credential-store.ts';
import { RefreshingTokenProvider } from './auth/refreshing-token-provider.ts';
import { MetraCardsApiClient } from './clients/metracards-api.ts';
import { config } from './config/index.ts';
import { createServer } from './server/create-server.ts';

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
