import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { createDynamoOAuthStore } from './dynamo-store.ts';
import type {
  AuthCodeRecord,
  PendingAuthorizeRequest,
  RegisteredClient,
} from './store.ts';

type Item = Record<string, unknown> & { pk: string; sk: string };

function createFakeDocClient(options?: { coordinateReads?: boolean }) {
  const items = new Map<string, Item>();
  const getCommands: GetCommand[] = [];
  const keyOf = (pk: string, sk: string) => `${pk}|${sk}`;
  const pendingReads: (() => void)[] = [];

  const waitForConcurrentRead = async () => {
    if (options?.coordinateReads !== true) {
      return;
    }

    await new Promise<void>((resolve) => {
      pendingReads.push(resolve);
      if (pendingReads.length === 2) {
        pendingReads.forEach((release) => release());
      }
    });
  };

  return {
    items,
    getCommands,
    docClient: {
      async send(command: unknown): Promise<unknown> {
        if (command instanceof PutCommand) {
          const item = command.input.Item as Item;
          items.set(keyOf(item.pk, item.sk), { ...item });
          return {};
        }

        if (command instanceof GetCommand) {
          getCommands.push(command);
          const key = command.input.Key as { pk: string; sk: string };
          await waitForConcurrentRead();
          return { Item: items.get(keyOf(key.pk, key.sk)) };
        }

        if (command instanceof DeleteCommand) {
          const key = command.input.Key as { pk: string; sk: string };
          const itemKey = keyOf(key.pk, key.sk);
          if (
            command.input.ConditionExpression === 'attribute_exists(pk)' &&
            !items.has(itemKey)
          ) {
            const error = new Error('Conditional check failed');
            error.name = 'ConditionalCheckFailedException';
            throw error;
          }
          items.delete(itemKey);
          return {};
        }

        throw new Error('Unexpected DynamoDB command');
      },
    },
  };
}

const sampleClient: RegisteredClient = {
  clientId: 'client-1',
  redirectUris: ['https://example.com/callback'],
  tokenEndpointAuthMethod: 'none',
  createdAt: '2026-08-01T00:00:00.000Z',
};

const sampleCode: AuthCodeRecord = {
  clientId: 'client-1',
  redirectUri: 'https://example.com/callback',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
  uid: 'uid-1',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  idTokenExpiresAtSec: 1_700_000_000,
  expiresAtMs: 0,
};

const samplePending: PendingAuthorizeRequest = {
  clientId: 'client-1',
  redirectUri: 'https://example.com/callback',
  codeChallenge: 'challenge',
  state: 'state',
  createdAtMs: 1_000,
};

describe('createDynamoOAuthStore', () => {
  it('saves and retrieves clients by client id', async () => {
    const fake = createFakeDocClient();
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
    });

    await store.saveClient(sampleClient);

    assert.deepEqual(await store.getClient(sampleClient.clientId), sampleClient);
    assert.equal(await store.getClient('missing'), undefined);
    assert.deepEqual(fake.items.get('CLIENT#client-1|META'), {
      pk: 'CLIENT#client-1',
      sk: 'META',
      client: sampleClient,
    });
    assert.equal(fake.getCommands[0]?.input.ConsistentRead, true);
  });

  it('saves and consumes an authorization code once', async () => {
    let now = 1_000;
    const fake = createFakeDocClient();
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
      now: () => now,
      codeTtlMs: 120_000,
    });

    await store.saveAuthCode('code-1', sampleCode);

    assert.deepEqual(await store.consumeAuthCode('code-1'), {
      ...sampleCode,
      expiresAtMs: 121_000,
    });
    assert.equal(await store.consumeAuthCode('code-1'), undefined);
    assert.equal(fake.items.has('CODE#code-1|META'), false);
    assert.equal(fake.getCommands[0]?.input.ConsistentRead, true);
    now = 2_000;
  });

  it('allows only one concurrent authorization code consumer to redeem a code', async () => {
    const fake = createFakeDocClient({ coordinateReads: true });
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
      now: () => 1_000,
    });

    await store.saveAuthCode('code-race', sampleCode);

    const results = await Promise.all([
      store.consumeAuthCode('code-race'),
      store.consumeAuthCode('code-race'),
    ]);

    assert.deepEqual(
      results.filter((result) => result !== undefined),
      [{ ...sampleCode, expiresAtMs: 121_000 }],
    );
    assert.equal(
      results.filter((result) => result === undefined).length,
      1,
    );
  });

  it('deletes expired authorization codes and returns undefined', async () => {
    let now = 1_000;
    const fake = createFakeDocClient();
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
      now: () => now,
      codeTtlMs: 1_000,
    });

    await store.saveAuthCode('expired-code', sampleCode);
    now = 2_000;

    assert.equal(await store.consumeAuthCode('expired-code'), undefined);
    assert.equal(fake.items.has('CODE#expired-code|META'), false);
  });

  it('saves and consumes pending authorization requests once', async () => {
    let now = 1_000;
    const fake = createFakeDocClient();
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
      now: () => now,
      pendingTtlMs: 600_000,
    });

    await store.savePendingAuthorize('login-1', samplePending);

    assert.deepEqual(
      await store.consumePendingAuthorize('login-1'),
      samplePending,
    );
    assert.equal(await store.consumePendingAuthorize('login-1'), undefined);
    assert.deepEqual(fake.items.get('PENDING#login-1|META'), undefined);
  });

  it('deletes expired pending authorization requests and returns undefined', async () => {
    let now = 1_000;
    const fake = createFakeDocClient();
    const store = createDynamoOAuthStore({
      tableName: 'oauth',
      docClient: fake.docClient,
      now: () => now,
      pendingTtlMs: 1_000,
    });

    await store.savePendingAuthorize('expired-login', samplePending);
    now = 2_000;

    assert.equal(
      await store.consumePendingAuthorize('expired-login'),
      undefined,
    );
    assert.equal(fake.items.has('PENDING#expired-login|META'), false);
  });
});
