import { McpServer } from '@modelcontextprotocol/server';
import type { CredentialStore } from '../auth/credential-store.js';
import type { TokenProvider } from '../auth/token-provider.js';
import type { MetraCardsApiClient } from '../clients/metracards-api.js';
import { config } from '../config/index.js';
import { registerAuthTools } from '../tools/auth/index.js';
import { registerCardsTools } from '../tools/cards/index.js';
import { registerDecksTools } from '../tools/decks/index.js';
import { registerHealthCheck } from '../tools/health-check.js';
import { registerReviewsTools } from '../tools/reviews/index.js';
import { registerSchedulesTools } from '../tools/schedules/index.js';
import { registerStatsTools } from '../tools/stats/index.js';

export type CreateServerOptions = {
  client: MetraCardsApiClient;
  tokenProvider: TokenProvider;
  store: CredentialStore;
};

export function createServer(options: CreateServerOptions): McpServer {
  const { client, tokenProvider, store } = options;

  const server = new McpServer({
    name: 'metracards-mcp',
    version: '0.1.0',
  });

  registerHealthCheck(server, client);
  registerAuthTools(server, {
    firebase: config.firebase,
    store,
    tokenProvider,
    client,
  });
  registerDecksTools(server, client);
  registerCardsTools(server, client, {
    tokenProvider,
    maxMediaBytes: config.maxMediaBytes,
  });
  registerReviewsTools(server, client);
  registerSchedulesTools(server, client);
  registerStatsTools(server, client);

  return server;
}
