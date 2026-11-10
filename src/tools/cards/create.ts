import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { mediaFieldsSchema, uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerCardsCreate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_create',
    {
      description: 'Create a flashcard for the authenticated user',
      inputSchema: z.object({
        id: uuidSchema.optional(),
        deck_id: uuidSchema,
        front: z.string(),
        back: z.string(),
        category: z.string().nullable().optional(),
        ...mediaFieldsSchema,
      }),
    },
    async (input) => {
      try {
        return textResult(await client.createFlashcard(input));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
