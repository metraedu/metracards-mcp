import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { reviewCreateItemSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerReviewsCreate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'reviews_create',
    {
      description:
        'Record a review (again|hard|good|easy) for a flashcard; may update spaced-repetition fields server-side',
      inputSchema: reviewCreateItemSchema,
    },
    async (input) => {
      try {
        return textResult(await client.createReview(input));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
