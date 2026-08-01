import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { CredentialStore } from '../auth/credential-store.js';
import type { TokenProvider } from '../auth/token-provider.js';
import { AuthRequiredError } from '../auth/token-provider.js';
import { runBrowserLogin } from '../auth/browser-login.js';
import type { AuthProvider, FirebaseConfig } from '../auth/types.js';
import type { MetraCardsApiClient } from '../clients/metracards-api.js';
import { MetraCardsApiError } from '../clients/metracards-api.js';

export type AuthToolDeps = {
  firebase: FirebaseConfig | null;
  store: CredentialStore;
  tokenProvider: TokenProvider;
  client: MetraCardsApiClient;
  runLogin?: typeof runBrowserLogin;
};

function textResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function registerAuthTools(server: McpServer, deps: AuthToolDeps): void {
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
        deps.tokenProvider.seedCache(login.idToken);

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

  server.registerTool(
    'auth_logout',
    {
      description: 'Clear locally stored MetraCards MCP credentials',
      inputSchema: z.object({}),
    },
    async () => {
      await deps.store.clear();
      deps.tokenProvider.clearCache();
      return textResult({ ok: true, authenticated: false });
    },
  );

  server.registerTool(
    'auth_status',
    {
      description: 'Show whether MetraCards MCP has stored user credentials',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const profile = await deps.tokenProvider.getStoredProfile();
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
