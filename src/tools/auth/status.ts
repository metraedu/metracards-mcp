import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { AuthRequiredError } from '../../auth/token-provider.ts';
import { textResult } from '../shared.ts';
import type { AuthToolDeps } from './deps.ts';

export function registerAuthStatus(
  server: McpServer,
  deps: AuthToolDeps,
): void {
  server.registerTool(
    'auth_status',
    {
      description:
        'Show whether MetraCards MCP has an authenticated user (stdio credentials or HTTP Bearer / OAuth)',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const profile = await deps.tokenProvider.getProfile();
        if (!profile) {
          return textResult({ authenticated: false });
        }
        return textResult({
          authenticated: true,
          uid: profile.uid,
          email: profile.email,
          displayName: profile.displayName,
          provider: profile.provider,
          updatedAt: profile.updatedAt,
        });
      } catch (err) {
        if (err instanceof AuthRequiredError) {
          return textResult({ authenticated: false });
        }
        const message = err instanceof Error ? err.message : String(err);
        return textResult({ authenticated: false, error: message }, true);
      }
    },
  );
}
