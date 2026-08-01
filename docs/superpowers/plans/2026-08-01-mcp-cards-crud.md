# MetraCards MCP Cards CRUD (+ Media) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated flashcard CRUD MCP tools (`cards_list`, `cards_get`, `cards_create`, `cards_update`, `cards_delete`) plus `cards_upload_media` and `cards_generate_audio`, matching `metracards_api` / `metracards-web` contracts.

**Architecture:** Extend `MetraCardsApiClient` with `/flashcards`, `/s3/presigned-url`, and `/audio` methods. Shared `src/media/upload.ts` reads local files (or TTS buffers), builds S3 keys with stored `uid`, presigns, and PUTs. Thin MCP tools in `src/tools/cards.ts` return JSON text results like decks.

**Tech Stack:** Node 20+, TypeScript, native `fetch`/`fs`, existing MCP SDK + zod + `MetraCardsApiClient` / `AuthRequiredError` / `CredentialStore`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-mcp-cards-crud-design.md`
- Depends on auth + decks already working
- Tool names are `cards_*`; HTTP paths remain `/flashcards`
- Field contract mirrors API snake_case; no camelCase remap
- Tools never log or return tokens
- Log only with `console.error` on stdio
- Tests: `npm test` → `node --experimental-strip-types --test src/**/*.test.ts`
- Skip git commit steps unless the user asked to commit
- Out of scope: batch, deleted, deck card pagination, API/web changes, base64 file tool args

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/clients/metracards-api.ts` | Flashcard + presign + audio client methods |
| `src/clients/metracards-api.test.ts` | Unit tests for those methods |
| `src/media/upload.ts` | Key builder + local/buffer upload via presign+PUT |
| `src/media/upload.test.ts` | Unit tests for media helper |
| `src/tools/cards.ts` | Register seven `cards_*` tools |
| `src/server/create-server.ts` | Wire `registerCardsTools` with client + store |
| `README.md` | Document card + media tools and image create flow |

---

### Task 1: API client — flashcard CRUD

**Files:**
- Modify: `src/clients/metracards-api.ts`
- Modify: `src/clients/metracards-api.test.ts`

**Interfaces:**
- Consumes: existing `request(..., { auth: true })`, `readJsonOrThrow`
- Produces:
  - `CreateFlashcardBody` / `UpdateFlashcardBody` (snake_case; see code below)
  - `listFlashcards(opts?: { deck_id?: string; since?: string }): Promise<unknown>`
  - `getFlashcard(id: string): Promise<unknown>`
  - `createFlashcard(body: CreateFlashcardBody): Promise<unknown>`
  - `updateFlashcard(id: string, body: UpdateFlashcardBody): Promise<unknown>`
  - `deleteFlashcard(id: string): Promise<unknown>`

- [ ] **Step 1: Write failing tests**

Append to `src/clients/metracards-api.test.ts`:

```ts
describe('MetraCardsApiClient.listFlashcards', () => {
  it('GETs /flashcards with Bearer, deck_id, and since', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedAuth: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedAuth = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify([{ id: 'c1', front: 'hi' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.listFlashcards({
        deck_id: '11111111-1111-1111-1111-111111111111',
        since: '2026-01-01T00:00:00.000Z',
      });
      assert.equal(
        capturedUrl,
        'http://example.test/flashcards?deck_id=11111111-1111-1111-1111-111111111111&since=2026-01-01T00%3A00%3A00.000Z',
      );
      assert.equal(capturedAuth, 'Bearer tok');
      assert.deepEqual(result, [{ id: 'c1', front: 'hi' }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.createFlashcard', () => {
  it('POSTs /flashcards with Bearer and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(JSON.stringify({ id: 'c1', front: 'a', back: 'b' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const body = {
        deck_id: '11111111-1111-1111-1111-111111111111',
        front: 'a',
        back: 'b',
        category: null,
      };
      const result = await client.createFlashcard(body);
      assert.equal(capturedMethod, 'POST');
      assert.equal(capturedUrl, 'http://example.test/flashcards');
      assert.equal(capturedBody, JSON.stringify(body));
      assert.deepEqual(result, { id: 'c1', front: 'a', back: 'b' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws MetraCardsApiError on non-2xx', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('nope', { status: 400 });

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      await assert.rejects(
        () =>
          client.createFlashcard({
            deck_id: '11111111-1111-1111-1111-111111111111',
            front: 'a',
            back: 'b',
          }),
        (err: unknown) => {
          assert.ok(err instanceof MetraCardsApiError);
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.getFlashcard', () => {
  it('GETs /flashcards/{id} with Bearer', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    globalThis.fetch = async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: 'c1', front: 'a' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      await client.getFlashcard('c1');
      assert.equal(capturedUrl, 'http://example.test/flashcards/c1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.updateFlashcard', () => {
  it('PUTs /flashcards/{id} with Bearer and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(JSON.stringify({ id: 'c1', front: 'z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      await client.updateFlashcard('c1', { front: 'z' });
      assert.equal(capturedMethod, 'PUT');
      assert.equal(capturedUrl, 'http://example.test/flashcards/c1');
      assert.equal(capturedBody, JSON.stringify({ front: 'z' }));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.deleteFlashcard', () => {
  it('DELETEs /flashcards/{id} with Bearer', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      return new Response(JSON.stringify({ message: 'Flashcard deleted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.deleteFlashcard('c1');
      assert.equal(capturedMethod, 'DELETE');
      assert.equal(capturedUrl, 'http://example.test/flashcards/c1');
      assert.deepEqual(result, { message: 'Flashcard deleted' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (methods missing)**

Run: `npm test`

Expected: FAIL referencing `listFlashcards` / `createFlashcard` (or similar).

- [ ] **Step 3: Implement types + methods on `MetraCardsApiClient`**

Add types next to deck types in `src/clients/metracards-api.ts`:

```ts
export type CreateFlashcardBody = {
  id?: string;
  deck_id: string;
  front: string;
  back: string;
  category?: string | null;
  audio_file_url?: string | null;
  image_file_url?: string | null;
  back_audio_file_url?: string | null;
  back_image_file_url?: string | null;
  audio_file_size?: number;
  image_file_size?: number;
  back_audio_file_size?: number;
  back_image_file_size?: number;
};

export type UpdateFlashcardBody = {
  front?: string;
  back?: string;
  category?: string | null;
  audio_file_url?: string | null;
  image_file_url?: string | null;
  back_audio_file_url?: string | null;
  back_image_file_url?: string | null;
  audio_file_size?: number;
  image_file_size?: number;
  back_audio_file_size?: number;
  back_image_file_size?: number;
  next_review?: string;
  last_review?: string | null;
  mastery_level?: number;
  consecutive_correct?: number;
  ease_factor?: number;
  total_reviews?: number;
  total_correct?: number;
  average_quality?: number;
  version?: number;
};
```

Implement methods mirroring deck helpers (`listDecks` query style with `URLSearchParams` or manual encode; `encodeURIComponent` for ids):

```ts
async listFlashcards(opts?: {
  deck_id?: string;
  since?: string;
}): Promise<unknown> {
  const params = new URLSearchParams();
  if (opts?.deck_id) params.set('deck_id', opts.deck_id);
  if (opts?.since) params.set('since', opts.since);
  const query = params.toString();
  const response = await this.request(
    `/flashcards${query ? `?${query}` : ''}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'list flashcards');
}

async getFlashcard(id: string): Promise<unknown> {
  const response = await this.request(
    `/flashcards/${encodeURIComponent(id)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'get flashcard');
}

async createFlashcard(body: CreateFlashcardBody): Promise<unknown> {
  const response = await this.request(
    '/flashcards',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'create flashcard');
}

async updateFlashcard(
  id: string,
  body: UpdateFlashcardBody,
): Promise<unknown> {
  const response = await this.request(
    `/flashcards/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'update flashcard');
}

async deleteFlashcard(id: string): Promise<unknown> {
  const response = await this.request(
    `/flashcards/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'delete flashcard');
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test`

Expected: PASS for new flashcard CRUD describes.

---

### Task 2: API client — presigned URL + generate audio

**Files:**
- Modify: `src/clients/metracards-api.ts`
- Modify: `src/clients/metracards-api.test.ts`

**Interfaces:**
- Produces:
  - `CreatePresignedUrlBody = { action: 'putObject' | 'getObject'; key: string; contentType?: string }`
  - `createPresignedUrl(body): Promise<{ url: string; expiresIn: number }>`
  - `generateAudio(input: { text: string; language: string }): Promise<{ audioBase64: string; language: string }>`
  - Body for audio API: `{ text, lang }` (matches web / Python lambda)

- [ ] **Step 1: Write failing tests**

```ts
describe('MetraCardsApiClient.createPresignedUrl', () => {
  it('POSTs /s3/presigned-url with Bearer and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedBody: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(
        JSON.stringify({ url: 'https://s3.example/put', expiresIn: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.createPresignedUrl({
        action: 'putObject',
        key: 'users/u1/flashcards/c1/front-image-1.png',
        contentType: 'image/png',
      });
      assert.equal(capturedUrl, 'http://example.test/s3/presigned-url');
      assert.equal(
        capturedBody,
        JSON.stringify({
          action: 'putObject',
          key: 'users/u1/flashcards/c1/front-image-1.png',
          contentType: 'image/png',
        }),
      );
      assert.deepEqual(result, {
        url: 'https://s3.example/put',
        expiresIn: 3600,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.generateAudio', () => {
  it('POSTs /audio with text+lang and returns base64 + language', async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: string | null = null;
    globalThis.fetch = async (_url, init) => {
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(
        JSON.stringify({ audio: 'YWFh', language: 'en' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.generateAudio({
        text: 'hello',
        language: 'en',
      });
      assert.equal(capturedBody, JSON.stringify({ text: 'hello', lang: 'en' }));
      assert.deepEqual(result, { audioBase64: 'YWFh', language: 'en' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws when audio payload missing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ language: 'en' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      await assert.rejects(
        () => client.generateAudio({ text: 'x', language: 'en' }),
        (err: unknown) => {
          assert.ok(err instanceof MetraCardsApiError);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test`

Expected: FAIL for missing methods.

- [ ] **Step 3: Implement methods**

```ts
export type CreatePresignedUrlBody = {
  action: 'putObject' | 'getObject';
  key: string;
  contentType?: string;
};

export type GenerateAudioInput = {
  text: string;
  language: string;
};

export type GenerateAudioResult = {
  audioBase64: string;
  language: string;
};

async createPresignedUrl(
  body: CreatePresignedUrlBody,
): Promise<{ url: string; expiresIn: number }> {
  const response = await this.request(
    '/s3/presigned-url',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    { auth: true },
  );
  const parsed = (await this.readJsonOrThrow(
    response,
    'create presigned url',
  )) as { url?: unknown; expiresIn?: unknown };
  if (typeof parsed.url !== 'string' || typeof parsed.expiresIn !== 'number') {
    throw new MetraCardsApiError(
      'MetraCards API create presigned url returned invalid payload',
    );
  }
  return { url: parsed.url, expiresIn: parsed.expiresIn };
}

async generateAudio(
  input: GenerateAudioInput,
): Promise<GenerateAudioResult> {
  const response = await this.request(
    '/audio',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: input.text, lang: input.language }),
    },
    { auth: true },
  );
  const parsed = (await this.readJsonOrThrow(
    response,
    'generate audio',
  )) as {
    audio?: unknown;
    language?: unknown;
    data?: { audio?: unknown; language?: unknown };
  };
  const audioBase64 =
    (typeof parsed.audio === 'string' ? parsed.audio : undefined) ??
    (typeof parsed.data?.audio === 'string' ? parsed.data.audio : undefined);
  if (!audioBase64) {
    throw new MetraCardsApiError(
      'MetraCards API generate audio response missing audio',
    );
  }
  const language =
    (typeof parsed.language === 'string' ? parsed.language : undefined) ??
    (typeof parsed.data?.language === 'string'
      ? parsed.data.language
      : undefined) ??
    input.language;
  return { audioBase64, language };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test`

---

### Task 3: Media upload helper

**Files:**
- Create: `src/media/upload.ts`
- Create: `src/media/upload.test.ts`

**Interfaces:**
- Consumes: `client.createPresignedUrl`; optional injectable `fetchImpl` / `readFile` for tests
- Produces:
  - `buildFlashcardMediaKey({ uid, flashcardId, side, kind, extension }): string`
  - `uploadMediaBuffer({ client, uid, flashcardId, side, kind, buffer, contentType, extension }): Promise<{ key: string; size: number }>`
  - `uploadMediaFile({ client, uid, flashcardId, side, kind, filePath }): Promise<{ key: string; size: number }>`

- [ ] **Step 1: Write failing tests**

`src/media/upload.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildFlashcardMediaKey,
  uploadMediaBuffer,
  uploadMediaFile,
} from './upload.ts';

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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test`

Expected: FAIL module not found / exports missing.

- [ ] **Step 3: Implement `src/media/upload.ts`**

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MetraCardsApiError } from '../clients/metracards-api.js';

export type MediaSide = 'front' | 'back';
export type MediaKind = 'audio' | 'image';

export type PresignClient = {
  createPresignedUrl(body: {
    action: 'putObject' | 'getObject';
    key: string;
    contentType?: string;
  }): Promise<{ url: string; expiresIn: number }>;
};

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
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return 'image/png';
  }
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'ogg') return 'audio/ogg';
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
    body: input.buffer,
  });
  if (!response.ok) {
    throw new MetraCardsApiError(
      `S3 upload returned HTTP ${response.status}`,
      { statusCode: response.status },
    );
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
  const extension =
    path.extname(input.filePath).replace(/^\./, '') || 'bin';
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
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test`

---

### Task 4: Cards CRUD tools + wire server

**Files:**
- Create: `src/tools/cards.ts`
- Modify: `src/server/create-server.ts`
- Modify: `README.md` (CRUD rows only; media rows in Task 5)

**Interfaces:**
- Consumes: `MetraCardsApiClient` flashcard methods; `AuthRequiredError`; same `textResult` / `mapToolError` pattern as `src/tools/decks.ts`
- Produces: `registerCardsTools(server, client, deps)` — for this task `deps` may be unused yet, but accept `{ store: CredentialStore }` for Task 5 (or pass store from the start)

- [ ] **Step 1: Implement `src/tools/cards.ts` with five CRUD tools**

Mirror `src/tools/decks.ts` error mapping; hint text: `Call auth_login to sign in before using card tools.`

Schemas:

```ts
const uuidSchema = z.string().uuid();

// cards_list
z.object({
  deck_id: uuidSchema.optional(),
  since: z.string().min(1).optional(),
})

// cards_get / cards_delete
z.object({ id: uuidSchema })

// cards_create
z.object({
  id: uuidSchema.optional(),
  deck_id: uuidSchema,
  front: z.string(),
  back: z.string(),
  category: z.string().nullable().optional(),
  audio_file_url: z.string().nullable().optional(),
  image_file_url: z.string().nullable().optional(),
  back_audio_file_url: z.string().nullable().optional(),
  back_image_file_url: z.string().nullable().optional(),
  audio_file_size: z.number().int().optional(),
  image_file_size: z.number().int().optional(),
  back_audio_file_size: z.number().int().optional(),
  back_image_file_size: z.number().int().optional(),
})

// cards_update — id required + optional fields from UpdateFlashcardBody
```

Handlers call `client.listFlashcards` / `getFlashcard` / `createFlashcard` / `updateFlashcard` / `deleteFlashcard`.

Export:

```ts
export type CardsToolDeps = {
  store: CredentialStore;
};

export function registerCardsTools(
  server: McpServer,
  client: MetraCardsApiClient,
  deps: CardsToolDeps,
): void
```

For Task 4, `deps` is accepted but media tools are registered in Task 5.

- [ ] **Step 2: Wire in `create-server.ts`**

```ts
import { registerCardsTools } from '../tools/cards.js';
// ...
registerDecksTools(server, apiClient);
registerCardsTools(server, apiClient, { store });
```

- [ ] **Step 3: Update README tools table with the five CRUD tools**

Add rows for `cards_list`, `cards_get`, `cards_create`, `cards_update`, `cards_delete`. Note they require prior `auth_login`.

- [ ] **Step 4: Run `npm test` and `npm run build`**

Expected: PASS / compile OK.

---

### Task 5: Media tools + README flow

**Files:**
- Modify: `src/tools/cards.ts`
- Modify: `README.md`
- Create: `src/tools/cards-media.test.ts` (optional thin unit test for generate path with mocks) — preferred: test orchestration via a small exported helper OR keep logic inline and unit-test through mocking client+upload in `src/media/upload.test.ts` already done; add one test file that imports a pure `attachGeneratedAudio` helper if extracted.

Prefer keeping tools thin: implement media tools inline calling `uploadMediaFile` / `client.generateAudio` + `uploadMediaBuffer`.

- [ ] **Step 1: Register `cards_upload_media`**

```ts
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
```

- [ ] **Step 2: Register `cards_generate_audio`**

```ts
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
```

- [ ] **Step 3: README — media tools + create-with-image recipe**

Add tool rows for `cards_upload_media` and `cards_generate_audio`.

Add a short section:

```markdown
## Create a card with images

1. `auth_login`
2. Choose/create a deck (`decks_list` / `decks_create`)
3. Generate a flashcard UUID
4. `cards_upload_media` with absolute `file_path`, `side`, `kind: "image"`
5. `cards_create` with the same `id`, `deck_id`, `front`, `back`, and `image_file_url` / `image_file_size` (and back fields if needed)

For TTS: `cards_generate_audio` then pass `audio_file_url` / `audio_file_size` (or back equivalents) into create/update.
```

- [ ] **Step 4: Run `npm test` and `npm run build`**

Expected: PASS / compile OK.

- [ ] **Step 5: Manual smoke (when API available)**

1. `auth_login`
2. `cards_create` text-only
3. `cards_generate_audio` → `cards_update` with keys
4. `cards_upload_media` with a local png → update/create
5. `cards_get` → `cards_delete`

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `cards_list/get/create/update/delete` | 1, 4 |
| snake_case pass-through + media fields on create/update | 1, 4 |
| `cards_upload_media` (absolute path → key/size) | 3, 5 |
| `cards_generate_audio` (/audio → upload) | 2, 3, 5 |
| Key shape `users/{uid}/flashcards/...` | 3 |
| Auth + 401 retry via existing client | 1–2 |
| Error mapping / auth hint | 4–5 |
| README tools + flow | 4–5 |
| Unit tests client + media | 1–3 |
| Out of scope batch/deleted/etc. | (none) |

## Self-review notes

- No placeholders; method names consistent (`createPresignedUrl`, `uploadMediaFile`, `uploadMediaBuffer`).
- `createPresignedUrl` is client-internal; agents only see `cards_upload_media` / `cards_generate_audio`.
- `file_path` must be absolute (enforced in helper).
