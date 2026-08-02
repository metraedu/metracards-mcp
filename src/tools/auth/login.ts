import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { runBrowserLogin } from '../../auth/browser-login.js';
import type { AuthProvider } from '../../auth/types.js';
import { MetraCardsApiError } from '../../clients/metracards-api.js';
import { textResult } from '../shared.js';
import type { AuthToolDeps } from './deps.js';

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

      if (!deps.firebase) {
        return textResult(
          {
            ok: false,
            error:
              'Firebase config missing. Set FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, and FIREBASE_APP_ID.',
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
