import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { mediaFieldsSchema, uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

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
          authHint: 'Call auth_login to sign in before using card tools.',
        });
      }
    },
  );
}
