import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFlashcardMediaPresign } from './presign.ts';

function clientStub(calls: unknown[]) {
  return {
    createPresignedUrl: async (body: unknown) => {
      calls.push(body);
      return { url: 'https://s3.example/put?sig=abc', expiresIn: 900 };
    },
  };
}

describe('createFlashcardMediaPresign', () => {
  it('presigns a PUT for a uid-scoped key and returns the fields to update', async () => {
    const calls: unknown[] = [];

    const result = await createFlashcardMediaPresign({
      client: clientStub(calls),
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'audio',
      fileExtension: 'mp3',
      nowMs: 42,
    });

    assert.deepEqual(calls, [
      {
        action: 'putObject',
        key: 'users/uid1/flashcards/c1/front-audio-42.mp3',
        contentType: 'audio/mpeg',
      },
    ]);
    assert.equal(result.url, 'https://s3.example/put?sig=abc');
    assert.equal(result.key, 'users/uid1/flashcards/c1/front-audio-42.mp3');
    assert.equal(result.content_type, 'audio/mpeg');
    assert.equal(result.expires_in, 900);
    assert.equal(result.url_field, 'audio_file_url');
    assert.equal(result.size_field, 'audio_file_size');
  });

  it('defaults the extension to mp3 for audio and png for image', async () => {
    const audio = await createFlashcardMediaPresign({
      client: clientStub([]),
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'audio',
      nowMs: 42,
    });
    const image = await createFlashcardMediaPresign({
      client: clientStub([]),
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'image',
      nowMs: 42,
    });

    assert.ok(audio.key.endsWith('.mp3'));
    assert.equal(audio.content_type, 'audio/mpeg');
    assert.ok(image.key.endsWith('.png'));
    assert.equal(image.content_type, 'image/png');
  });

  it('accepts an extension with a leading dot and derives its content type', async () => {
    const result = await createFlashcardMediaPresign({
      client: clientStub([]),
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'back',
      kind: 'image',
      fileExtension: '.jpg',
      nowMs: 42,
    });

    assert.equal(result.key, 'users/uid1/flashcards/c1/back-image-42.jpg');
    assert.equal(result.content_type, 'image/jpeg');
    assert.equal(result.url_field, 'back_image_file_url');
    assert.equal(result.size_field, 'back_image_file_size');
  });

  it('tells the caller how to PUT the file and attach it', async () => {
    const result = await createFlashcardMediaPresign({
      client: clientStub([]),
      uid: 'uid1',
      flashcardId: 'c1',
      side: 'front',
      kind: 'audio',
      nowMs: 42,
    });

    assert.match(result.instructions, /curl/);
    assert.match(result.instructions, /cards_update/);
    assert.match(result.instructions, /audio_file_size/);
  });

  it('propagates presign failures', async () => {
    const failing = {
      createPresignedUrl: async () => {
        throw new Error('presign exploded');
      },
    };

    await assert.rejects(
      createFlashcardMediaPresign({
        client: failing,
        uid: 'uid1',
        flashcardId: 'c1',
        side: 'front',
        kind: 'audio',
      }),
      /presign exploded/,
    );
  });
});
