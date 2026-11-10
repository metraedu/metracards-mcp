import type { MetraCardsApiClient } from '../../clients/metracards-api.ts';
import { mediaFieldNames } from '../../media/upload.ts';

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
