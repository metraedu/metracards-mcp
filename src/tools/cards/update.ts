import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { mediaFieldsSchema, uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerCardsUpdate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_update',
    {
      description: 'Update a flashcard by id',
      inputSchema: z.object({
        id: uuidSchema,
        front: z.string().optional(),
        back: z.string().optional(),
        category: z.string().nullable().optional(),
        ...mediaFieldsSchema,
        next_review: z.string().optional(),
        last_review: z.string().nullable().optional(),
        mastery_level: z.number().int().optional(),
        consecutive_correct: z.number().int().optional(),
        ease_factor: z.number().optional(),
        total_reviews: z.number().int().optional(),
        total_correct: z.number().int().optional(),
        average_quality: z.number().optional(),
        version: z.number().int().optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateFlashcard(id, body));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Call auth_login to sign in before using card tools.',
        });
      }
    },
  );
}
