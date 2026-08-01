import { McpServer } from '@modelcontextprotocol/server';
import { CredentialStore } from '../auth/credential-store.js';
import { TokenProvider } from '../auth/token-provider.js';
import { MetraCardsApiClient } from '../clients/metracards-api.js';
import { config } from '../config/index.js';
import { registerAuthTools } from '../tools/auth.js';
import { registerCardsTools } from '../tools/cards.js';
import { registerDecksTools } from '../tools/decks.js';
import { registerHealthCheck } from '../tools/health-check.js';

export function createServer(
  client?: MetraCardsApiClient,
): McpServer {
  const store = new CredentialStore(config.credentialsPath);
  const tokenProvider = new TokenProvider(
    store,
    config.firebase?.apiKey ?? '',
  );
  const apiClient =
    client ?? new MetraCardsApiClient(config.apiUrl, tokenProvider);

  const server = new McpServer({
    name: 'metracards-mcp',
    version: '0.1.0',
  });

  registerHealthCheck(server, apiClient);
  registerAuthTools(server, {
    firebase: config.firebase,
    store,
    tokenProvider,
    client: apiClient,
  });
  registerDecksTools(server, apiClient);
  registerCardsTools(server, apiClient, { store });

  return server;
}
