import type { AuthProvider } from './types.js';

export type TokenProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider?: AuthProvider;
  updatedAt?: string;
};

export type TokenProvider = {
  getIdToken(): Promise<string>;
  getUid(): Promise<string>;
  getProfile(): Promise<TokenProfile | null>;
  clearCache(): void;
};

export class AuthRequiredError extends Error {
  constructor(
    message = 'Not authenticated. Use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
  ) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
