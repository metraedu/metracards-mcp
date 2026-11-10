import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerDecksDeleteBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_delete_batch',
    {
      description:
        'Delete up to 100 decks by id. Also removes each deck\'s flashcards and permanently deletes their review history and media files (POST /decks/batch/delete).',
      inputSchema: z.object({
        ids: z.array(uuidSchema).min(1).max(100),
      }),
    },
    async ({ ids }) => {
      try {
        return textResult(await client.deleteDecksBatch(ids));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
