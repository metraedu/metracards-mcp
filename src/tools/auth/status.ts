import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { AuthRequiredError } from '../../auth/token-provider.js';
import { textResult } from '../shared.js';
import type { AuthToolDeps } from './deps.js';

export function registerAuthStatus(
  server: McpServer,
  deps: AuthToolDeps,
): void {
  server.registerTool(
    'auth_status',
    {
      description:
        'Show whether the current MCP request has an authenticated user (Bearer / OAuth)',
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
