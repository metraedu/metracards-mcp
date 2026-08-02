import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertMediaByteLength,
  buildFlashcardMediaKey,
  decodeContentBase64,
  MediaUploadError,
  uploadMediaBuffer,
  uploadMediaFile,
} from './upload.ts';

describe('decodeContentBase64', () => {
  it('decodes raw base64', () => {
    assert.deepEqual(decodeContentBase64('YWJj'), Buffer.from('abc'));
  });

  it('strips data URL prefix', () => {
    assert.deepEqual(
      decodeContentBase64('data:image/png;base64,YWJj'),
      Buffer.from('abc'),
    );
  });
});

describe('assertMediaByteLength', () => {
  it('rejects oversize buffers', () => {
    assert.throws(
      () => assertMediaByteLength(Buffer.from('abcd'), 3),
      MediaUploadError,
    );
  });
});

describe('buildFlashcardMediaKey', () => {
  it('uses users/{uid}/flashcards/{id}/{side}-{kind}-{ts}.{ext}', () => {
    const key = buildFlashcardMediaKey({
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'image',
      extension: 'png',
      nowMs: 1700000000000,
    });
    assert.equal(
      key,
      'users/uid1/flashcards/c1/front-image-1700000000000.png',
    );
  });
});

describe('uploadMediaBuffer', () => {
  it('presigns then PUTs bytes and returns key+size', async () => {
    const calls: Array<{ url: string; method?: string }> = [];
    const client = {
      createPresignedUrl: async () => ({
        url: 'https://s3.example/put',
        expiresIn: 3600,
      }),
    };
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      return new Response(null, { status: 200 });
    };

    const result = await uploadMediaBuffer({
      client,
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'audio',
      buffer: Buffer.from('abc'),
      contentType: 'audio/mpeg',
      extension: 'mp3',
      nowMs: 42,
      fetchImpl,
    });

    assert.deepEqual(result, {
      key: 'users/uid1/flashcards/c1/front-audio-42.mp3',
      size: 3,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'https://s3.example/put');
    assert.equal(calls[0]?.method, 'PUT');
  });
});

describe('uploadMediaFile', () => {
  it('reads local file and uploads', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-media-'));
    const filePath = path.join(dir, 'pic.png');
    await writeFile(filePath, Buffer.from([1, 2, 3, 4]));

    const client = {
      createPresignedUrl: async (body: {
        key: string;
        contentType?: string;
      }) => {
        assert.match(body.key, /\.png$/);
        assert.equal(body.contentType, 'image/png');
        return { url: 'https://s3.example/put', expiresIn: 3600 };
      },
    };
    const fetchImpl: typeof fetch = async () =>
      new Response(null, { status: 200 });

    const result = await uploadMediaFile({
      client,
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'back',
      kind: 'image',
      filePath,
      fetchImpl,
    });

    assert.equal(result.size, 4);
    assert.match(result.key, /^users\/uid1\/flashcards\/c1\/back-image-/);
  });
});
