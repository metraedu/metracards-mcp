import type { CredentialStore } from './credential-store.ts';
import type { StoredCredentials } from './types.ts';
import type { TokenProfile, TokenProvider } from './token-provider.ts';

export class AuthRequiredError extends Error {
  constructor(
    message = 'Not authenticated. On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
  ) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

type TokenCache = {
  idToken: string;
  expiresAtMs: number;
};

type RefreshResponse = {
  id_token?: string;
  refresh_token?: string;
  expires_in?: string;
  error?: string | { message?: string };
};

export class RefreshingTokenProvider implements TokenProvider {
  readonly canPersistCredentials = true;

  private cache: TokenCache | null = null;
  private readonly store: CredentialStore;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    store: CredentialStore,
    apiKey: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.store = store;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  clearCache(): void {
    this.cache = null;
  }

  async getProfile(): Promise<TokenProfile | null> {
    const credentials = await this.store.load();
    if (!credentials) {
      return null;
    }
    return profileFromStored(credentials);
  }

  async getUid(): Promise<string> {
    const credentials = await this.store.load();
    if (!credentials) {
      throw new AuthRequiredError();
    }
    return credentials.uid;
  }

  async getIdToken(): Promise<string> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAtMs - 60_000 > now) {
      return this.cache.idToken;
    }

    const credentials = await this.store.load();
    if (!credentials) {
      throw new AuthRequiredError();
    }

    const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(this.apiKey)}`;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AuthRequiredError(
        `Failed to refresh Firebase ID token: ${message}. Call auth_login.`,
      );
    }

    const text = await response.text();
    let parsed: RefreshResponse;
    try {
      parsed = JSON.parse(text) as RefreshResponse;
    } catch {
      throw new AuthRequiredError(
        'Firebase token refresh returned invalid JSON. Call auth_login.',
      );
    }

    if (!response.ok || typeof parsed.id_token !== 'string') {
      await this.store.clear();
      this.clearCache();
      const detail =
        typeof parsed.error === 'string'
          ? parsed.error
          : parsed.error?.message || `HTTP ${response.status}`;
      throw new AuthRequiredError(
        `Firebase refresh failed (${detail}). Call auth_login.`,
      );
    }

    const expiresInSec = Number(parsed.expires_in ?? '3600');
    this.cache = {
      idToken: parsed.id_token,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    };

    if (
      typeof parsed.refresh_token === 'string' &&
      parsed.refresh_token !== credentials.refreshToken
    ) {
      await this.store.save({
        ...credentials,
        refreshToken: parsed.refresh_token,
        updatedAt: new Date().toISOString(),
      });
    }

    return parsed.id_token;
  }

  seedCache(idToken: string, expiresInSec = 3600): void {
    this.cache = {
      idToken,
      expiresAtMs: Date.now() + expiresInSec * 1000,
    };
  }
}

function profileFromStored(credentials: StoredCredentials): TokenProfile {
  return {
    uid: credentials.uid,
    email: credentials.email,
    displayName: credentials.displayName,
    provider: credentials.provider,
    updatedAt: credentials.updatedAt,
  };
}
