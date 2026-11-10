import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { registerCardsCreate } from './create.ts';
import { registerCardsCreateBatch } from './create-batch.ts';
import { registerCardsDelete } from './delete.ts';
import { registerCardsDeleteBatch } from './delete-batch.ts';
import type { CardsToolDeps } from './deps.ts';
import { registerCardsGenerateAudio } from './generate-audio.ts';
import { registerCardsGet } from './get.ts';
import { registerCardsList } from './list.ts';
import { registerCardsMediaPresign } from './media-presign.ts';
import { registerCardsUpdate } from './update.ts';
import { registerCardsUploadMedia } from './upload-media.ts';

export type { CardsToolDeps } from './deps.ts';

export function registerCardsTools(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  registerCardsList(server, client);
  registerCardsGet(server, client);
  registerCardsCreate(server, client);
  registerCardsUpdate(server, client);
  registerCardsDelete(server, client);
  registerCardsCreateBatch(server, client);
  registerCardsDeleteBatch(server, client);
  registerCardsMediaPresign(server, client, deps);
  registerCardsUploadMedia(server, client, deps);
  registerCardsGenerateAudio(server, client, deps);
}
