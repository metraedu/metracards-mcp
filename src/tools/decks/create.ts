import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { colorSchema, uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerDecksCreate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_create',
    {
      description: 'Create a deck for the authenticated user',
      inputSchema: z.object({
        id: uuidSchema.optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(await client.createDeck(input));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Authenticate via OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
