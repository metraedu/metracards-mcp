import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { mapToolError, textResult } from '../shared.js';

export function registerStatsActivity(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'stats_activity',
    {
      description:
        'Get review activity calendar (reviews_by_date, streaks). Optional months (1–24) defaults to 12 when omitted. GET /activity',
      inputSchema: z.object({
        months: z.number().int().min(1).max(24).optional(),
      }),
    },
    async ({ months }) => {
      try {
        return textResult(await client.getActivityMap(months));
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
