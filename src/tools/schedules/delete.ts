import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerSchedulesDelete(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_delete',
    {
      description:
        'Soft-delete a review schedule by id (API: DELETE /review-schedules/{id})',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteReviewSchedule(id));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
