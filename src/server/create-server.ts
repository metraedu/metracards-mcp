import { McpServer } from '@modelcontextprotocol/server';
import type { CredentialStore } from '../auth/credential-store.ts';
import type { TokenProvider } from '../auth/token-provider.ts';
import type { MetraCardsApiClient } from '../clients/metracards-api.ts';
import { config } from '../config/index.ts';
import { registerAuthTools } from '../tools/auth/index.ts';
import { registerCardsTools } from '../tools/cards/index.ts';
import { registerDecksTools } from '../tools/decks/index.ts';
import { registerHealthCheck } from '../tools/health-check.ts';
import { registerReviewsTools } from '../tools/reviews/index.ts';
import { registerSchedulesTools } from '../tools/schedules/index.ts';
import { registerStatsTools } from '../tools/stats/index.ts';

export const MEDIA_UPLOAD_INSTRUCTIONS = [
  'When a user supplies a local image or audio file, do not read, inspect, decode, transcribe, or convert it to base64 unless the user explicitly asks for content analysis.',
  'Without an explicit analysis request, use only upload metadata: path, extension, MIME type, and byte size.',
  'On hosted HTTP, call cards_media_presign, perform a direct PUT from the caller disk to the returned URL, then call cards_update with the returned key and local byte size.',
  'Never log, display, repeat, or disclose a presigned URL.',
  'Use cards_upload_media only when this local/stdio server can access an absolute file_path.',
].join('\n');

export type CreateServerOptions = {
  client: MetraCardsApiClient;
  tokenProvider: TokenProvider;
  store: CredentialStore;
};

export function createServer(options: CreateServerOptions): McpServer {
  const { client, tokenProvider, store } = options;

  const server = new McpServer(
    {
      name: 'metracards-mcp',
      version: '0.1.0',
    },
    {
      instructions: MEDIA_UPLOAD_INSTRUCTIONS,
    },
  );

  registerHealthCheck(server, client);
  registerAuthTools(server, {
    firebase: config.firebase,
    store,
    tokenProvider,
    client,
  });
  registerDecksTools(server, client);
  registerCardsTools(server, client, { tokenProvider });
  registerReviewsTools(server, client);
  registerSchedulesTools(server, client);
  registerStatsTools(server, client);

  return server;
}
