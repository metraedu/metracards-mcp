import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { uploadMediaBuffer } from '../../media/upload.ts';
import { uuidSchema } from '../schemas.ts';
import { mapToolError, textResult } from '../shared.ts';
import type { CardsToolDeps } from './deps.ts';
import { attachMediaToFlashcard } from './media.ts';

export function registerCardsGenerateAudio(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_generate_audio',
    {
      description:
        'Generate TTS audio via MetraCards /audio, upload to S3, and attach it to the flashcard (updates audio_file_url/audio_file_size on the given side)',
      inputSchema: z.object({
        flashcard_id: uuidSchema,
        side: z.enum(['front', 'back']),
        text: z.string().min(1),
        language: z.string().min(1),
      }),
    },
    async ({ flashcard_id, side, text, language }) => {
      try {
        const uid = await deps.tokenProvider.getUid();
        const audio = await client.generateAudio({ text, language });
        const buffer = Buffer.from(audio.audioBase64, 'base64');
        const uploaded = await uploadMediaBuffer({
          client,
          uid,
          flashcardId: flashcard_id,
          side,
          kind: 'audio',
          buffer,
          contentType: 'audio/mpeg',
          extension: 'mp3',
        });
        const updated = await attachMediaToFlashcard(client, {
          flashcardId: flashcard_id,
          side,
          kind: 'audio',
          key: uploaded.key,
          size: uploaded.size,
        });
        return textResult({
          ...(updated as Record<string, unknown>),
          language: audio.language,
        });
      } catch (err) {
        return mapToolError(err, {
          authHint: 'On stdio call auth_login; on HTTP use OAuth Connect or Authorization: Bearer <Firebase ID token>.',
        });
      }
    },
  );
}
