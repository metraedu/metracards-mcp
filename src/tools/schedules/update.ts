import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { daysOfWeekSchema, hhMmSchema, uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerSchedulesUpdate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_update',
    {
      description: 'Update a review schedule by id (API: PUT /review-schedules/{id})',
      inputSchema: z.object({
        id: uuidSchema,
        time: hhMmSchema,
        days_of_week: daysOfWeekSchema,
        enabled: z.boolean().optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateReviewSchedule(id, body));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
