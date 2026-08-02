import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerCardsGet(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_get',
    {
      description: 'Get a flashcard by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.getFlashcard(id));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Authenticate via OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
