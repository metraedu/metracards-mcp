import type { CredentialStore } from '../../auth/credential-store.js';
import type { TokenProvider } from '../../auth/token-provider.js';
import type { FirebaseConfig } from '../../auth/types.js';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import type { runBrowserLogin } from '../../auth/browser-login.js';

export type AuthToolDeps = {
  firebase: FirebaseConfig | null;
  store: CredentialStore;
  tokenProvider: TokenProvider;
  client: MetraCardsApiClient;
  runLogin?: typeof runBrowserLogin;
};
