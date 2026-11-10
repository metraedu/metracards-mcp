import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerSchedulesDeleteBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_delete_batch',
    {
      description:
        'Soft-delete up to 500 review schedules (POST /review-schedules/batch/delete)',
      inputSchema: z.object({
        ids: z.array(uuidSchema).min(1).max(500),
      }),
    },
    async ({ ids }) => {
      try {
        return textResult(await client.deleteReviewSchedulesBatch(ids));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
