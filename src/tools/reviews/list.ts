import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerReviewsList(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'reviews_list',
    {
      description:
        'List review history for the authenticated user (optional card_id / since)',
      inputSchema: z.object({
        card_id: uuidSchema.optional(),
        since: z.string().min(1).optional(),
      }),
    },
    async ({ card_id, since }) => {
      try {
        return textResult(await client.listReviews({ card_id, since }));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
