import { McpServer } from '@modelcontextprotocol/server';
import { MetraCardsApiClient } from '../clients/metracards-api.js';
import { config } from '../config/index.js';
import { registerHealthCheck } from '../tools/health-check.js';

export function createServer(
  client: MetraCardsApiClient = new MetraCardsApiClient(config.apiUrl),
): McpServer {
  const server = new McpServer({
    name: 'metracards-mcp',
    version: '0.1.0',
  });

  registerHealthCheck(server, client);
  return server;
}
