import {
  DeleteCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  AuthCodeRecord,
  OAuthStore,
  PendingAuthorizeRequest,
  RegisteredClient,
} from './store.ts';

export type DynamoOAuthStoreDeps = {
  tableName: string;
  docClient: {
    send(command: unknown): Promise<unknown>;
  };
  codeTtlMs?: number;
  pendingTtlMs?: number;
  now?: () => number;
};

type DynamoItem = Record<string, unknown> & {
  pk: string;
  sk: string;
  expiresAt?: number;
};

type GetResult = {
  Item?: DynamoItem;
};

function getItem(result: unknown): DynamoItem | undefined {
  return (result as GetResult).Item;
}

function getAuthCodeRecord(item: DynamoItem): AuthCodeRecord {
  const { expiresAt: _, pk: __, sk: ___, ...record } = item;
  return record as AuthCodeRecord;
}

function getPendingAuthorizeRequest(item: DynamoItem): PendingAuthorizeRequest {
  const { expiresAt: _, pk: __, sk: ___, ...record } = item;
  return record as PendingAuthorizeRequest;
}

function isConditionalCheckFailed(error: unknown): boolean {
  return (
    error instanceof Error && error.name === 'ConditionalCheckFailedException'
  );
}

export function createDynamoOAuthStore(
  deps: DynamoOAuthStoreDeps,
): OAuthStore {
  const codeTtlMs = deps.codeTtlMs ?? 120_000;
  const pendingTtlMs = deps.pendingTtlMs ?? 600_000;
  const now = deps.now ?? (() => Date.now());

  return {
    async saveClient(client) {
      await deps.docClient.send(
        new PutCommand({
          TableName: deps.tableName,
          Item: {
            pk: `CLIENT#${client.clientId}`,
            sk: 'META',
            client,
          },
        }),
      );
    },
    async getClient(clientId) {
      const result = await deps.docClient.send(
        new GetCommand({
          TableName: deps.tableName,
          Key: { pk: `CLIENT#${clientId}`, sk: 'META' },
        }),
      );
      const item = getItem(result);
      return item?.client as RegisteredClient | undefined;
    },
    async saveAuthCode(code, record) {
      const expiresAtMs = now() + codeTtlMs;
      await deps.docClient.send(
        new PutCommand({
          TableName: deps.tableName,
          Item: {
            pk: `CODE#${code}`,
            sk: 'META',
            ...record,
            expiresAtMs,
            expiresAt: Math.floor(expiresAtMs / 1000),
          },
        }),
      );
    },
    async consumeAuthCode(code) {
      const key = { pk: `CODE#${code}`, sk: 'META' };
      const result = await deps.docClient.send(
        new GetCommand({
          TableName: deps.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      );
      const item = getItem(result);
      if (item === undefined) {
        return undefined;
      }
      try {
        await deps.docClient.send(
          new DeleteCommand({
            TableName: deps.tableName,
            Key: key,
            ConditionExpression: 'attribute_exists(pk)',
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return undefined;
        }
        throw error;
      }
      if ((item.expiresAt ?? 0) * 1000 <= now()) {
        return undefined;
      }
      return getAuthCodeRecord(item);
    },
    async savePendingAuthorize(loginState, record) {
      const expiresAtMs = now() + pendingTtlMs;
      await deps.docClient.send(
        new PutCommand({
          TableName: deps.tableName,
          Item: {
            pk: `PENDING#${loginState}`,
            sk: 'META',
            ...record,
            expiresAt: Math.floor(expiresAtMs / 1000),
          },
        }),
      );
    },
    async consumePendingAuthorize(loginState) {
      const key = { pk: `PENDING#${loginState}`, sk: 'META' };
      const result = await deps.docClient.send(
        new GetCommand({
          TableName: deps.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      );
      const item = getItem(result);
      if (item === undefined) {
        return undefined;
      }
      try {
        await deps.docClient.send(
          new DeleteCommand({
            TableName: deps.tableName,
            Key: key,
            ConditionExpression: 'attribute_exists(pk)',
          }),
        );
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return undefined;
        }
        throw error;
      }
      if ((item.expiresAt ?? 0) * 1000 <= now()) {
        return undefined;
      }
      return getPendingAuthorizeRequest(item);
    },
  };
}
