import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { registerCardsCreate } from './create.js';
import { registerCardsCreateBatch } from './create-batch.js';
import { registerCardsDelete } from './delete.js';
import { registerCardsDeleteBatch } from './delete-batch.js';
import type { CardsToolDeps } from './deps.js';
import { registerCardsGenerateAudio } from './generate-audio.js';
import { registerCardsGet } from './get.js';
import { registerCardsList } from './list.js';
import { registerCardsMediaPresign } from './media-presign.js';
import { registerCardsUpdate } from './update.js';
import { registerCardsUploadMedia } from './upload-media.js';

export type { CardsToolDeps } from './deps.js';

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
