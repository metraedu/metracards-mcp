import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { registerSchedulesCreate } from './create.js';
import { registerSchedulesCreateBatch } from './create-batch.js';
import { registerSchedulesDelete } from './delete.js';
import { registerSchedulesDeleteBatch } from './delete-batch.js';
import { registerSchedulesGet } from './get.js';
import { registerSchedulesList } from './list.js';
import { registerSchedulesUpdate } from './update.js';

export function registerSchedulesTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  registerSchedulesList(server, client);
  registerSchedulesGet(server, client);
  registerSchedulesCreate(server, client);
  registerSchedulesUpdate(server, client);
  registerSchedulesDelete(server, client);
  registerSchedulesCreateBatch(server, client);
  registerSchedulesDeleteBatch(server, client);
}
