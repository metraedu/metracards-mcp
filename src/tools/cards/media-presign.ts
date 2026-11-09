import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { createFlashcardMediaPresign } from '../../media/presign.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';
import type { CardsToolDeps } from './deps.js';

export function registerCardsMediaPresign(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_media_presign',
    {
      description:
        'Get a presigned PUT URL to upload flashcard media from the caller machine, without sending base64 through the context. Upload the file with curl, then attach it with cards_update using the returned url_field/size_field. Preferred over cards_upload_media on hosted HTTP.',
      inputSchema: z.object({
        flashcard_id: uuidSchema,
        side: z.enum(['front', 'back']),
        kind: z.enum(['audio', 'image']),
        file_extension: z.string().min(1).optional(),
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
