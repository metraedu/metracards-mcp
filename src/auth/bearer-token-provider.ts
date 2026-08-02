import type { TokenProfile, TokenProvider } from './token-provider.js';

export type BearerTokenProviderOptions = {
  uid: string;
  idToken: string;
  email?: string | null;
  displayName?: string | null;
};

export class BearerTokenProvider implements TokenProvider {
  readonly canPersistCredentials = false;

  private readonly uid: string;
  private readonly idToken: string;
  private readonly email: string | null;
  private readonly displayName: string | null;

  constructor(options: BearerTokenProviderOptions) {
    this.uid = options.uid;
    this.idToken = options.idToken;
    this.email = options.email ?? null;
    this.displayName = options.displayName ?? null;
  }

  async getIdToken(): Promise<string> {
    return this.idToken;
  }

  async getUid(): Promise<string> {
    return this.uid;
  }

  async getProfile(): Promise<TokenProfile | null> {
    return {
      uid: this.uid,
      email: this.email,
      displayName: this.displayName,
    };
  }

  clearCache(): void {}

  seedCache(_idToken: string, _expiresInSec?: number): void {}
}
