import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uploadMediaFile as uploadFromPath } from '../../media/upload.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';
import type { CardsToolDeps } from './deps.ts';
import { attachMediaToFlashcard } from './media.ts';

const uploadMediaInputSchema = z
  .object({
    flashcard_id: uuidSchema,
    side: z.enum(['front', 'back']),
    kind: z.enum(['audio', 'image']),
    file_path: z.string().min(1),
  })
  .strict();

export function registerCardsUploadMedia(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_upload_media',
    {
      description:
        'Upload image/audio from an absolute file_path accessible to this local/stdio server and attach it to the flashcard. Hosted HTTP clients must use cards_media_presign instead.',
      inputSchema: uploadMediaInputSchema,
    },
    async (input) => {
      try {
        const uid = await deps.tokenProvider.getUid();
        const { flashcard_id, side, kind, file_path } = input;
        const uploaded = await uploadFromPath({
          client,
          uid,
          flashcardId: flashcard_id,
          side,
          kind,
          filePath: file_path,
        });
        const updated = await attachMediaToFlashcard(client, {
          flashcardId: flashcard_id,
          side,
          kind,
          key: uploaded.key,
          size: uploaded.size,
        });
        return textResult(updated);
      } catch (err) {
        return mapToolError(err, {
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
