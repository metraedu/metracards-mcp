import type { CredentialStore } from '../../auth/credential-store.ts';
import type { TokenProvider } from '../../auth/token-provider.ts';
import type { FirebaseConfig } from '../../auth/types.ts';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import type { runBrowserLogin } from '../../auth/browser-login.ts';

export type AuthToolDeps = {
  firebase: FirebaseConfig;
  store: CredentialStore;
  tokenProvider: TokenProvider;
  client: MetraCardsApiClient;
  runLogin?: typeof runBrowserLogin;
};
