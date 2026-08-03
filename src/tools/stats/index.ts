import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { registerStatsActivity } from './activity.js';
import { registerStatsUsage } from './usage.js';

export function registerStatsTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  registerStatsUsage(server, client);
  registerStatsActivity(server, client);
}
