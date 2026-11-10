import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { runBrowserLogin } from '../../auth/browser-login.ts';
import type { AuthProvider } from '../../auth/types.ts';
import { MetraCardsApiError } from '../../clients/metracards-api.ts';
import { textResult } from '../shared.ts';
import type { AuthToolDeps } from './deps.ts';

export function registerAuthLogin(
  server: McpServer,
  deps: AuthToolDeps,
): void {
  const runLogin = deps.runLogin ?? runBrowserLogin;

  server.registerTool(
    'auth_login',
    {
      description:
        'Open a browser to sign in with Google or Apple, store credentials locally, and upsert the user in MetraCards API',
      inputSchema: z.object({
        provider: z.enum(['google', 'apple']).optional(),
      }),
    },
    async ({ provider }) => {
      if (!deps.tokenProvider.canPersistCredentials) {
        return textResult(
          {
            ok: false,
            error:
              'Browser login is not available over HTTP. Use OAuth Connect or authenticate with Authorization: Bearer <Firebase ID token>.',
          },
          true,
        );
      }

      try {
        const login = await runLogin({
          firebase: deps.firebase,
          provider: (provider ?? 'google') as AuthProvider,
        });

        await deps.store.save({
          refreshToken: login.refreshToken,
          uid: login.uid,
          email: login.email,
          displayName: login.displayName,
          photoURL: login.photoURL,
          provider: login.provider,
          updatedAt: new Date().toISOString(),
        });
        deps.tokenProvider.seedCache?.(login.idToken);

        let upsert: { ok: true } | { ok: false; message: string };
        try {
          await deps.client.upsertUser({
            display_name: login.displayName,
            photo_url: login.photoURL,
          });
          upsert = { ok: true };
        } catch (err) {
          const message =
            err instanceof MetraCardsApiError || err instanceof Error
              ? err.message
              : String(err);
          upsert = { ok: false, message };
        }

        return textResult({
          ok: true,
          authenticated: true,
          uid: login.uid,
          email: login.email,
          provider: login.provider,
          upsert,
          hint: upsert.ok
            ? undefined
            : 'Authenticated locally but POST /users failed. Retry auth_login or check METRACARDS_API_URL.',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return textResult({ ok: false, error: message }, true);
      }
    },
  );
}
