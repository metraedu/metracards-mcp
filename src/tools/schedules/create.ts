import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { scheduleUpsertItemSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerSchedulesCreate(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_create',
    {
      description:
        'Create a review schedule (id + HH:mm time + days_of_week 1-7 CSV or int array). API: POST /review-schedules',
      inputSchema: scheduleUpsertItemSchema,
    },
    async (input) => {
      try {
        return textResult(await client.createReviewSchedule(input));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
