import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { registerReviewsCreate } from './create.js';
import { registerReviewsCreateBatch } from './create-batch.js';
import { registerReviewsDelete } from './delete.js';
import { registerReviewsDeleteBatch } from './delete-batch.js';
import { registerReviewsGet } from './get.js';
import { registerReviewsList } from './list.js';

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
