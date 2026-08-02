import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerCardsDelete(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'cards_delete',
    {
      description: 'Soft-delete a flashcard by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteFlashcard(id));
      } catch (err) {
        return mapToolError(err, {
          authHint: 'Authenticate via OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
