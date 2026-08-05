import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerCardsDeleteBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_delete_batch',
    {
      description:
        'Soft-delete up to 500 flashcards by id (POST /flashcards/batch/delete)',
      inputSchema: z.object({
        ids: z.array(uuidSchema).min(1).max(500),
      }),
    },
    async ({ ids }) => {
      try {
        return textResult(await client.deleteFlashcardsBatch(ids));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
