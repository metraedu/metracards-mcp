import type { AuthProvider } from './types.ts';

export type TokenProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider?: AuthProvider;
  updatedAt?: string;
};

export type TokenProvider = {
  readonly canPersistCredentials: boolean;
  getIdToken(): Promise<string>;
  getUid(): Promise<string>;
  getProfile(): Promise<TokenProfile | null>;
  clearCache(): void;
  seedCache?(idToken: string, expiresInSec?: number): void;
};

export { AuthRequiredError } from './refreshing-token-provider.ts';
