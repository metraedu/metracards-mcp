import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type MediaSide = 'front' | 'back';
export type MediaKind = 'audio' | 'image';

export type PresignClient = {
  createPresignedUrl(body: {
    action: 'putObject' | 'getObject';
    key: string;
    contentType?: string;
  }): Promise<{ url: string; expiresIn: number }>;
};

export class MediaUploadError extends Error {
  readonly statusCode?: number;

  constructor(message: string, options?: { statusCode?: number }) {
    super(message);
    this.name = 'MediaUploadError';
    this.statusCode = options?.statusCode;
  }
}

export function buildFlashcardMediaKey(input: {
  uid: string;
  flashcardId: string;
  side: MediaSide;
  kind: MediaKind;
  extension: string;
  nowMs?: number;
}): string {
  const ts = input.nowMs ?? Date.now();
  const ext = input.extension.replace(/^\./, '').toLowerCase() || 'bin';
  return `users/${input.uid}/flashcards/${input.flashcardId}/${input.side}-${input.kind}-${ts}.${ext}`;
}

function guessContentType(kind: MediaKind, extension: string): string {
  const ext = extension.toLowerCase();
  if (kind === 'image') {
    if (ext === 'jpg' || ext === 'jpeg') {
      return 'image/jpeg';
    }
    if (ext === 'gif') {
      return 'image/gif';
    }
    if (ext === 'webp') {
      return 'image/webp';
    }
    return 'image/png';
  }
  if (ext === 'wav') {
    return 'audio/wav';
  }
  if (ext === 'ogg') {
    return 'audio/ogg';
  }
  return 'audio/mpeg';
}

export async function uploadMediaBuffer(input: {
  client: PresignClient;
  uid: string;
  flashcardId: string;
  side: MediaSide;
  kind: MediaKind;
  buffer: Buffer;
  contentType: string;
  extension: string;
  nowMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ key: string; size: number }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const key = buildFlashcardMediaKey({
    uid: input.uid,
    flashcardId: input.flashcardId,
    side: input.side,
    kind: input.kind,
    extension: input.extension,
    nowMs: input.nowMs,
  });
  const { url } = await input.client.createPresignedUrl({
    action: 'putObject',
    key,
    contentType: input.contentType,
  });
  const response = await fetchImpl(url, {
    method: 'PUT',
    headers: { 'Content-Type': input.contentType },
    body: new Uint8Array(input.buffer),
  });
  if (!response.ok) {
    throw new MediaUploadError(`S3 upload returned HTTP ${response.status}`, {
      statusCode: response.status,
    });
  }
  return { key, size: input.buffer.byteLength };
}

export async function uploadMediaFile(input: {
  client: PresignClient;
  uid: string;
  flashcardId: string;
  side: MediaSide;
  kind: MediaKind;
  filePath: string;
  fetchImpl?: typeof fetch;
}): Promise<{ key: string; size: number }> {
  if (!path.isAbsolute(input.filePath)) {
    throw new Error('file_path must be an absolute path');
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(input.filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read file_path: ${message}`);
  }
  const extension = path.extname(input.filePath).replace(/^\./, '') || 'bin';
  return uploadMediaBuffer({
    client: input.client,
    uid: input.uid,
    flashcardId: input.flashcardId,
    side: input.side,
    kind: input.kind,
    buffer,
    contentType: guessContentType(input.kind, extension),
    extension,
    fetchImpl: input.fetchImpl,
  });
}
