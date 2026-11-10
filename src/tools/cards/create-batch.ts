import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { cardCreateItemSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerCardsCreateBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_create_batch',
    {
      description:
        'Create up to 500 flashcards in one request (POST /flashcards/batch)',
      inputSchema: z.object({
        items: z.array(cardCreateItemSchema).min(1).max(500),
      }),
    },
    async ({ items }) => {
      try {
        return textResult(await client.createFlashcardsBatch(items));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
