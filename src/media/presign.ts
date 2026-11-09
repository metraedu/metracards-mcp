import {
  buildFlashcardMediaKey,
  guessContentType,
  mediaFieldNames,
  type MediaKind,
  type MediaSide,
  type PresignClient,
} from './upload.js';

const DEFAULT_EXTENSION: Record<MediaKind, string> = {
  audio: 'mp3',
  image: 'png',
};

export type FlashcardMediaPresign = {
  url: string;
  key: string;
  content_type: string;
  expires_in: number;
  url_field: string;
  size_field: string;
  instructions: string;
};

export async function createFlashcardMediaPresign(input: {
  client: PresignClient;
  uid: string;
  flashcardId: string;
  side: MediaSide;
  kind: MediaKind;
  fileExtension?: string;
  nowMs?: number;
}): Promise<FlashcardMediaPresign> {
  const extension =
    input.fileExtension?.replace(/^\./, '').toLowerCase() ||
    DEFAULT_EXTENSION[input.kind];
  const contentType = guessContentType(input.kind, extension);
  const key = buildFlashcardMediaKey({
    uid: input.uid,
    flashcardId: input.flashcardId,
    side: input.side,
    kind: input.kind,
    extension,
    nowMs: input.nowMs,
  });
  const { urlField, sizeField } = mediaFieldNames(input.side, input.kind);
  const { url, expiresIn } = await input.client.createPresignedUrl({
    action: 'putObject',
    key,
    contentType,
  });
  return {
    url,
    key,
    content_type: contentType,
    expires_in: expiresIn,
    url_field: urlField,
    size_field: sizeField,
    instructions: [
      `1. Upload the file yourself, without sending its bytes to the model:`,
      `   curl --fail --upload-file <absolute_path> -H "Content-Type: ${contentType}" "<url>"`,
      `2. Read the file size in bytes (stat -f%z <absolute_path> on macOS, stat -c%s on Linux).`,
      `3. Call cards_update with { id: "${input.flashcardId}", ${urlField}: "${key}", ${sizeField}: <bytes> }.`,
      `The upload URL expires in ${expiresIn}s and must not be logged or shared.`,
    ].join('\n'),
  };
}
