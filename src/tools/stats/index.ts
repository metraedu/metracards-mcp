import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerStatsActivity } from './activity.ts';
import { registerStatsUsage } from './usage.ts';

export function registerStatsTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  registerStatsUsage(server, client);
  registerStatsActivity(server, client);
}
