import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { colorSchema, uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerDecksUpdate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_update',
    {
      description: 'Update a deck by id',
      inputSchema: z.object({
        id: uuidSchema,
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateDeck(id, body));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
