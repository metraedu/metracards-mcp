import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { mapToolError, textResult } from '../shared.js';

export function registerStatsUsage(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'stats_usage',
    {
      description:
        'Get card count and media storage usage vs account limits (GET /users/usage-stats)',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return textResult(await client.getUsageStats());
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
