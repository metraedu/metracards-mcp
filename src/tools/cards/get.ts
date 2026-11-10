import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

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
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
