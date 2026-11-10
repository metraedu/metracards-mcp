import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { createFlashcardMediaPresign } from '../../media/presign.ts';
import { fileExtensionSchema, uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';
import type { CardsToolDeps } from './deps.ts';

export function registerCardsMediaPresign(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_media_presign',
    {
      description:
        'Required media upload flow for hosted HTTP clients. Get a presigned PUT URL, upload directly from caller disk without reading or sending media bytes through model context, then attach the returned key and local byte size with cards_update. Never log, display, repeat, or disclose the URL.',
      inputSchema: z.object({
        flashcard_id: uuidSchema,
        side: z.enum(['front', 'back']),
        kind: z.enum(['audio', 'image']),
        file_extension: fileExtensionSchema,
      }),
    },
    async ({ flashcard_id, side, kind, file_extension }) => {
      try {
        const uid = await deps.tokenProvider.getUid();
        return textResult(
          await createFlashcardMediaPresign({
            client,
            uid,
            flashcardId: flashcard_id,
            side,
            kind,
            fileExtension: file_extension,
          }),
        );
      } catch (err) {
        return mapToolError(err, {
          authHint:
            'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
