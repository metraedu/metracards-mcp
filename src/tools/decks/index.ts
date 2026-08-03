import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { registerDecksCreate } from './create.js';
import { registerDecksCreateBatch } from './create-batch.js';
import { registerDecksDelete } from './delete.js';
import { registerDecksDeleteBatch } from './delete-batch.js';
import { registerDecksGet } from './get.js';
import { registerDecksList } from './list.js';
import { registerDecksUpdate } from './update.js';

export function registerDecksTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  registerDecksList(server, client);
  registerDecksGet(server, client);
  registerDecksCreate(server, client);
  registerDecksUpdate(server, client);
  registerDecksDelete(server, client);
  registerDecksCreateBatch(server, client);
  registerDecksDeleteBatch(server, client);
}
