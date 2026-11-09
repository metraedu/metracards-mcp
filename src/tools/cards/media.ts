import type { MetraCardsApiClient } from '../../clients/metracards-api.js';
import {
  assertMediaByteLength,
  decodeContentBase64,
  guessContentType,
  mediaFieldNames,
  uploadMediaBuffer,
  type MediaKind,
} from '../../media/upload.js';

export async function uploadFromBase64(input: {
  client: MetraCardsApiClient;
  uid: string;
  flashcardId: string;
  side: 'front' | 'back';
  kind: MediaKind;
  contentBase64: string;
  contentType?: string;
  fileExtension?: string;
  maxMediaBytes: number;
}): Promise<{ key: string; size: number }> {
  const buffer = decodeContentBase64(input.contentBase64);
  assertMediaByteLength(buffer, input.maxMediaBytes);
  const extension =
    input.fileExtension?.replace(/^\./, '') ||
    (input.kind === 'image' ? 'png' : 'mp3');
  const contentType =
    input.contentType || guessContentType(input.kind, extension);
  return uploadMediaBuffer({
    client: input.client,
    uid: input.uid,
    flashcardId: input.flashcardId,
    side: input.side,
    kind: input.kind,
    buffer,
    contentType,
    extension,
  });
}

export function attachMediaToFlashcard(
  client: MetraCardsApiClient,
  input: {
    flashcardId: string;
    side: 'front' | 'back';
    kind: 'audio' | 'image';
    key: string;
    size: number;
  },
): Promise<unknown> {
  const { urlField, sizeField } = mediaFieldNames(input.side, input.kind);
  return client.updateFlashcard(input.flashcardId, {
    [urlField]: input.key,
    [sizeField]: input.size,
  } as Record<string, unknown>);
}
