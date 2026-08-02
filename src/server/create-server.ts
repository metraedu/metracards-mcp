import { McpServer } from '@modelcontextprotocol/server';
import type { TokenProvider } from '../auth/token-provider.js';
import type { MetraCardsApiClient } from '../clients/metracards-api.js';
import { config } from '../config/index.js';
import { registerAuthTools } from '../tools/auth/index.js';
import { registerCardsTools } from '../tools/cards/index.js';
import { registerDecksTools } from '../tools/decks/index.js';
import { registerHealthCheck } from '../tools/health-check.js';

export type CreateServerOptions = {
  client: MetraCardsApiClient;
  tokenProvider: TokenProvider;
};

export function createServer(options: CreateServerOptions): McpServer {
  const { client, tokenProvider } = options;

  const server = new McpServer({
    name: 'metracards-mcp',
    version: '0.1.0',
  });

  registerHealthCheck(server, client);
  registerAuthTools(server, { tokenProvider });
  registerDecksTools(server, client);
  registerCardsTools(server, client, {
    tokenProvider,
    maxMediaBytes: config.maxMediaBytes,
  });

  return server;
}
