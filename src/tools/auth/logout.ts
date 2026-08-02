import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { textResult } from '../shared.js';
import type { AuthToolDeps } from './deps.js';

export function registerAuthLogout(
  server: McpServer,
  deps: AuthToolDeps,
): void {
  server.registerTool(
    'auth_logout',
    {
      description: 'Clear locally stored MetraCards MCP credentials',
      inputSchema: z.object({}),
    },
    async () => {
      if (!deps.tokenProvider.canPersistCredentials) {
        return textResult(
          {
            ok: false,
            error:
              'No local credentials to clear on HTTP. Discard the Bearer token on the client.',
          },
          true,
        );
      }

      await deps.store.clear();
      deps.tokenProvider.clearCache();
      return textResult({ ok: true, authenticated: false });
    },
  );
}
