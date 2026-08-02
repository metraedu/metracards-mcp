import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoOAuthStore } from './dynamo-store.ts';
import { createMemoryOAuthStore, type OAuthStore } from './store.ts';

export function createOAuthStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OAuthStore {
  const tableName = env.METRACARDS_MCP_OAUTH_TABLE?.trim();

  if (!tableName) {
    return createMemoryOAuthStore();
  }

  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return createDynamoOAuthStore({ tableName, docClient });
}
