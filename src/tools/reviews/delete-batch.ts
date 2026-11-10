import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerReviewsDeleteBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'reviews_delete_batch',
    {
      description: 'Soft-delete up to 500 reviews by id (POST /reviews/batch/delete)',
      inputSchema: z.object({
        ids: z.array(uuidSchema).min(1).max(500),
      }),
    },
    async ({ ids }) => {
      try {
        return textResult(await client.deleteReviewsBatch(ids));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
