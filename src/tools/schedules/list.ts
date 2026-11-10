import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { mapToolError, textResult } from '../shared.ts';

export function registerSchedulesList(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'schedules_list',
    {
      description:
        'List review reminder schedules (API: GET /review-schedules)',
      inputSchema: z.object({
        since: z.string().min(1).optional(),
      }),
    },
    async ({ since }) => {
      try {
        return textResult(await client.listReviewSchedules(since));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
