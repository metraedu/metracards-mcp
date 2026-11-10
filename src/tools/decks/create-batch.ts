import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { deckCreateItemSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerDecksCreateBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_create_batch',
    {
      description: 'Create up to 100 decks in one request (POST /decks/batch)',
      inputSchema: z.object({
        items: z.array(deckCreateItemSchema).min(1).max(100),
      }),
    },
    async ({ items }) => {
      try {
        return textResult(await client.createDecksBatch(items));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
