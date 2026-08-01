import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { CredentialStore } from '../auth/credential-store.js';
import { AuthRequiredError } from '../auth/token-provider.js';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from '../clients/metracards-api.js';
import {
  MediaUploadError,
  uploadMediaBuffer,
  uploadMediaFile,
} from '../media/upload.js';

const uuidSchema = z.string().uuid();

const mediaFieldsSchema = {
  audio_file_url: z.string().nullable().optional(),
  image_file_url: z.string().nullable().optional(),
  back_audio_file_url: z.string().nullable().optional(),
  back_image_file_url: z.string().nullable().optional(),
  audio_file_size: z.number().int().optional(),
  image_file_size: z.number().int().optional(),
  back_audio_file_size: z.number().int().optional(),
  back_image_file_size: z.number().int().optional(),
};

export type CardsToolDeps = {
  store: CredentialStore;
};

function textResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [
      { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function mapToolError(err: unknown) {
  if (err instanceof AuthRequiredError) {
    return textResult(
      {
        ok: false,
        error: err.message || 'Not authenticated',
        hint: 'Call auth_login to sign in before using card tools.',
      },
      true,
    );
  }
  if (err instanceof MetraCardsApiError) {
    return textResult(
      {
        ok: false,
        error: err.message,
        statusCode: err.statusCode ?? null,
        body: err.body ?? null,
      },
      true,
    );
  }
  if (err instanceof MediaUploadError) {
    return textResult(
      {
        ok: false,
        error: err.message,
        statusCode: err.statusCode ?? null,
      },
      true,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return textResult({ ok: false, error: message }, true);
}

export function registerCardsTools(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void {
  server.registerTool(
    'cards_list',
    {
      description: 'List flashcards for the authenticated MetraCards user',
      inputSchema: z.object({
        deck_id: uuidSchema.optional(),
        since: z.string().min(1).optional(),
      }),
    },
    async ({ deck_id, since }) => {
      try {
        return textResult(await client.listFlashcards({ deck_id, since }));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_get',
    {
      description: 'Get a flashcard by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.getFlashcard(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_create',
    {
      description: 'Create a flashcard for the authenticated user',
      inputSchema: z.object({
        id: uuidSchema.optional(),
        deck_id: uuidSchema,
        front: z.string(),
        back: z.string(),
        category: z.string().nullable().optional(),
        ...mediaFieldsSchema,
      }),
    },
    async (input) => {
      try {
        return textResult(await client.createFlashcard(input));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_update',
    {
      description: 'Update a flashcard by id',
      inputSchema: z.object({
        id: uuidSchema,
        front: z.string().optional(),
        back: z.string().optional(),
        category: z.string().nullable().optional(),
        ...mediaFieldsSchema,
        next_review: z.string().optional(),
        last_review: z.string().nullable().optional(),
        mastery_level: z.number().int().optional(),
        consecutive_correct: z.number().int().optional(),
        ease_factor: z.number().optional(),
        total_reviews: z.number().int().optional(),
        total_correct: z.number().int().optional(),
        average_quality: z.number().optional(),
        version: z.number().int().optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateFlashcard(id, body));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_delete',
    {
      description: 'Soft-delete a flashcard by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteFlashcard(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_upload_media',
    {
      description:
        'Upload a local image/audio file to MetraCards media storage; returns S3 key and size for cards_create/update',
      inputSchema: z.object({
        flashcard_id: uuidSchema,
        side: z.enum(['front', 'back']),
        kind: z.enum(['audio', 'image']),
        file_path: z.string().min(1),
      }),
    },
    async ({ flashcard_id, side, kind, file_path }) => {
      try {
        const creds = await deps.store.load();
        if (!creds) {
          throw new AuthRequiredError();
        }
        const uploaded = await uploadMediaFile({
          client,
          uid: creds.uid,
          flashcardId: flashcard_id,
          side,
          kind,
          filePath: file_path,
        });
        return textResult(uploaded);
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'cards_generate_audio',
    {
      description:
        'Generate TTS audio via MetraCards /audio, upload to S3, return key/size/language for cards_create/update',
      inputSchema: z.object({
        flashcard_id: uuidSchema,
        side: z.enum(['front', 'back']),
        text: z.string().min(1),
        language: z.string().min(1),
      }),
    },
    async ({ flashcard_id, side, text, language }) => {
      try {
        const creds = await deps.store.load();
        if (!creds) {
          throw new AuthRequiredError();
        }
        const audio = await client.generateAudio({ text, language });
        const buffer = Buffer.from(audio.audioBase64, 'base64');
        const uploaded = await uploadMediaBuffer({
          client,
          uid: creds.uid,
          flashcardId: flashcard_id,
          side,
          kind: 'audio',
          buffer,
          contentType: 'audio/mpeg',
          extension: 'mp3',
        });
        return textResult({
          ...uploaded,
          language: audio.language,
        });
      } catch (err) {
        return mapToolError(err);
      }
    },
  );
}
