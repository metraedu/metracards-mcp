import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { mapToolError, textResult } from '../shared.js';

export function registerDecksList(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_list',
    {
      description: 'List decks for the authenticated MetraCards user',
      inputSchema: z.object({
        since: z.string().min(1).optional(),
      }),
    },
    async ({ since }) => {
      try {
        return textResult(await client.listDecks(since));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Call auth_login to sign in before using deck tools.',
        });
      }
    },
  );
}
