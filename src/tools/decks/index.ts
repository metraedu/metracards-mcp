import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerDecksCreate } from './create.ts';
import { registerDecksCreateBatch } from './create-batch.ts';
import { registerDecksDelete } from './delete.ts';
import { registerDecksDeleteBatch } from './delete-batch.ts';
import { registerDecksGet } from './get.ts';
import { registerDecksList } from './list.ts';
import { registerDecksUpdate } from './update.ts';

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
