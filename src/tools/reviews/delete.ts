import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerReviewsDelete(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'reviews_delete',
    {
      description: 'Soft-delete a review by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteReview(id));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
