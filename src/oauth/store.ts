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

export type PendingAuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  createdAtMs: number;
};

export type OAuthStore = {
  saveClient(client: RegisteredClient): Promise<void>;
  getClient(clientId: string): Promise<RegisteredClient | undefined>;
  saveAuthCode(code: string, record: AuthCodeRecord): Promise<void>;
  consumeAuthCode(code: string): Promise<AuthCodeRecord | undefined>;
  savePendingAuthorize(
    loginState: string,
    record: PendingAuthorizeRequest,
  ): Promise<void>;
  consumePendingAuthorize(
    loginState: string,
  ): Promise<PendingAuthorizeRequest | undefined>;
};

export function createMemoryOAuthStore(options?: {
  codeTtlMs?: number;
  pendingTtlMs?: number;
  now?: () => number;
}): OAuthStore {
  const codeTtlMs = options?.codeTtlMs ?? 120_000;
  const pendingTtlMs = options?.pendingTtlMs ?? 600_000;
  const now = options?.now ?? (() => Date.now());

  const clients = new Map<string, RegisteredClient>();
  const authCodes = new Map<string, AuthCodeRecord>();
  const pendingAuthorizes = new Map<string, PendingAuthorizeRequest>();

  return {
    async saveClient(client) {
      clients.set(client.clientId, client);
    },
    async getClient(clientId) {
      return clients.get(clientId);
    },
    async saveAuthCode(code, record) {
      authCodes.set(code, {
        ...record,
        expiresAtMs: now() + codeTtlMs,
      });
    },
    async consumeAuthCode(code) {
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
    async savePendingAuthorize(loginState, record) {
      pendingAuthorizes.set(loginState, record);
    },
    async consumePendingAuthorize(loginState) {
      const record = pendingAuthorizes.get(loginState);
      if (record === undefined) {
        return undefined;
      }
      pendingAuthorizes.delete(loginState);
      if (record.createdAtMs + pendingTtlMs <= now()) {
        return undefined;
      }
      return record;
    },
  };
}

/** @deprecated Use createMemoryOAuthStore instead. */
export const createOAuthStore = createMemoryOAuthStore;
