import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerCardsList(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_list',
    {
      description: 'List flashcards for the authenticated MetraCards user',
      inputSchema: z.object({
        deck_id: uuidSchema.optional(),
        since: z.string().min(1).optional(),
      }),
    },
    async ({ deck_id, since }) => {
      try {
        return textResult(await client.listFlashcards({ deck_id, since }));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
