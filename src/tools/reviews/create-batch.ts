import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { reviewCreateItemSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerReviewsCreateBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'reviews_create_batch',
    {
      description: 'Create up to 500 reviews in one request (POST /reviews/batch)',
      inputSchema: z.object({
        items: z.array(reviewCreateItemSchema).min(1).max(500),
      }),
    },
    async ({ items }) => {
      try {
        return textResult(await client.createReviewsBatch(items));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
