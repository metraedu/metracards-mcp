import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { scheduleUpsertItemSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';

export function registerSchedulesCreateBatch(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_create_batch',
    {
      description:
        'Create up to 500 review schedules (POST /review-schedules/batch)',
      inputSchema: z.object({
        items: z.array(scheduleUpsertItemSchema).min(1).max(500),
      }),
    },
    async ({ items }) => {
      try {
        return textResult(await client.createReviewSchedulesBatch(items));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
