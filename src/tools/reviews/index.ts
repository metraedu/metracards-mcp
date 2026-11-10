import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerReviewsCreate } from './create.ts';
import { registerReviewsCreateBatch } from './create-batch.ts';
import { registerReviewsDelete } from './delete.ts';
import { registerReviewsDeleteBatch } from './delete-batch.ts';
import { registerReviewsGet } from './get.ts';
import { registerReviewsList } from './list.ts';

export function registerReviewsTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  registerReviewsList(server, client);
  registerReviewsGet(server, client);
  registerReviewsCreate(server, client);
  registerReviewsDelete(server, client);
  registerReviewsCreateBatch(server, client);
  registerReviewsDeleteBatch(server, client);
}
