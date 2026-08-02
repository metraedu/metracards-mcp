import type { TokenProvider } from '../../auth/token-provider.js';

export type CardsToolDeps = {
  tokenProvider: TokenProvider;
  maxMediaBytes: number;
};
