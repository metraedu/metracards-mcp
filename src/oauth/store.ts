export type RegisteredClient = {
  clientId: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none';
  createdAt: string;
};

export type AuthCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  uid: string;
  idToken: string;
  refreshToken: string | null;
  idTokenExpiresAtSec: number;
  expiresAtMs: number;
};

export type OAuthStore = {
  saveClient(client: RegisteredClient): void;
  getClient(clientId: string): RegisteredClient | undefined;
  saveAuthCode(code: string, record: AuthCodeRecord): void;
  consumeAuthCode(code: string): AuthCodeRecord | undefined;
};

export function createOAuthStore(options?: {
  codeTtlMs?: number;
  now?: () => number;
}): OAuthStore {
  const codeTtlMs = options?.codeTtlMs ?? 120_000;
  const now = options?.now ?? (() => Date.now());

  const clients = new Map<string, RegisteredClient>();
  const authCodes = new Map<string, AuthCodeRecord>();

  return {
    saveClient(client) {
      clients.set(client.clientId, client);
    },
    getClient(clientId) {
      return clients.get(clientId);
    },
    saveAuthCode(code, record) {
      authCodes.set(code, {
        ...record,
        expiresAtMs: now() + codeTtlMs,
      });
    },
    consumeAuthCode(code) {
      const record = authCodes.get(code);
      if (record === undefined) {
        return undefined;
      }
      authCodes.delete(code);
      if (record.expiresAtMs <= now()) {
        return undefined;
      }
      return record;
    },
  };
}
