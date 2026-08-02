import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerDecksDelete(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_delete',
    {
      description: 'Soft-delete a deck by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteDeck(id));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Call auth_login to sign in before using deck tools.',
        });
      }
    },
  );
}
