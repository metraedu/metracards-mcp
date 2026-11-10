import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerSchedulesCreate } from './create.ts';
import { registerSchedulesCreateBatch } from './create-batch.ts';
import { registerSchedulesDelete } from './delete.ts';
import { registerSchedulesDeleteBatch } from './delete-batch.ts';
import { registerSchedulesGet } from './get.ts';
import { registerSchedulesList } from './list.ts';
import { registerSchedulesUpdate } from './update.ts';

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
