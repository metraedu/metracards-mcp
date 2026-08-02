import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import { uploadMediaFile as uploadFromPath } from '../../media/upload.js';
import { uuidSchema } from '../schemas.js';
import { mapToolError, textResult } from '../shared.js';
import type { CardsToolDeps } from './deps.js';
import { attachMediaToFlashcard, uploadFromBase64 } from './media.js';

const uploadMediaInputSchema = z
  .object({
    flashcard_id: uuidSchema,
    side: z.enum(['front', 'back']),
    kind: z.enum(['audio', 'image']),
    file_path: z.string().min(1).optional(),
    content_base64: z.string().min(1).optional(),
    content_type: z.string().min(1).optional(),
    file_extension: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasPath = Boolean(value.file_path);
    const hasBase64 = Boolean(value.content_base64);
    if (hasPath === hasBase64) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide exactly one of file_path or content_base64',
      });
    }
  });

export function registerCardsUploadMedia(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_upload_media',
    {
      description:
        'Upload image/audio to MetraCards media storage (file_path XOR content_base64) and attach it to the flashcard',
      inputSchema: uploadMediaInputSchema,
    },
    async (input) => {
      try {
        const uid = await deps.tokenProvider.getUid();
        const { flashcard_id, side, kind } = input;
        const uploaded = input.file_path
          ? await uploadFromPath({
              client,
              uid,
              flashcardId: flashcard_id,
              side,
              kind,
              filePath: input.file_path,
            })
          : await uploadFromBase64({
              client,
              uid,
              flashcardId: flashcard_id,
              side,
              kind,
              contentBase64: input.content_base64!,
              contentType: input.content_type,
              fileExtension: input.file_extension,
              maxMediaBytes: deps.maxMediaBytes,
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
          authHint: 'Authenticate via OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
