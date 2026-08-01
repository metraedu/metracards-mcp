import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from '../clients/metracards-api.js';

export function registerHealthCheck(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'health_check',
    {
      description: 'Check whether MetraCards API is healthy',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const health = await client.getHealth();
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(health, null, 2) },
          ],
        };
      } catch (err) {
        const message =
          err instanceof MetraCardsApiError
            ? JSON.stringify(
                {
                  error: err.message,
                  statusCode: err.statusCode ?? null,
                  body: err.body ?? null,
                },
                null,
                2,
              )
            : err instanceof Error
              ? err.message
              : String(err);

        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    },
  );
}
