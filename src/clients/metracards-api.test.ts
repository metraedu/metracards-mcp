import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from './metracards-api.ts';

describe('MetraCardsApiClient.getHealth', () => {
  it('returns parsed health payload on 200 without Authorization', async () => {
    const payload = {
      status: 'ok',
      timestamp: '2026-08-01T00:00:00.000Z',
      service: 'metracards-api',
    };
    const originalFetch = globalThis.fetch;
    let sawAuth = false;
    globalThis.fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      if (headers.has('Authorization')) {
        sawAuth = true;
      }
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test');
      const result = await client.getHealth();
      assert.deepEqual(result, payload);
      assert.equal(sawAuth, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws MetraCardsApiError on non-2xx', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('nope', { status: 503 });

    try {
      const client = new MetraCardsApiClient('http://example.test');
      await assert.rejects(
        () => client.getHealth(),
        (err: unknown) => {
          assert.ok(err instanceof MetraCardsApiError);
          assert.equal(err.statusCode, 503);
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.upsertUser', () => {
  it('sends Bearer token and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedAuth: string | null = null;
    let capturedBody: string | null = null;
    globalThis.fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      capturedAuth = headers.get('Authorization');
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response('{}', { status: 200 });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'token-xyz',
        clearCache: () => undefined,
      });
      await client.upsertUser({
        display_name: 'Ada',
        photo_url: null,
      });
      assert.equal(capturedAuth, 'Bearer token-xyz');
      assert.equal(
        capturedBody,
        JSON.stringify({ display_name: 'Ada', photo_url: null }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.listDecks', () => {
  it('GETs /decks with Bearer and optional since', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedAuth: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      capturedAuth = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify([{ id: 'd1', name: 'A' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.listDecks('2026-01-01T00:00:00.000Z');
      assert.equal(capturedMethod, 'GET');
      assert.equal(
        capturedUrl,
        'http://example.test/decks?since=2026-01-01T00%3A00%3A00.000Z',
      );
      assert.equal(capturedAuth, 'Bearer tok');
      assert.deepEqual(result, [{ id: 'd1', name: 'A' }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.createDeck', () => {
  it('POSTs /decks with Bearer and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedAuth: string | null = null;
    let capturedBody: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      capturedAuth = new Headers(init?.headers).get('Authorization');
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(JSON.stringify({ id: 'new-id', name: 'X' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const body = { name: 'X', color: 'FF2196F3', daily_new_cards_limit: 20 };
      const result = await client.createDeck(body);
      assert.equal(capturedMethod, 'POST');
      assert.equal(capturedUrl, 'http://example.test/decks');
      assert.equal(capturedAuth, 'Bearer tok');
      assert.equal(capturedBody, JSON.stringify(body));
      assert.deepEqual(result, { id: 'new-id', name: 'X' });
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
        () => client.createDeck({ name: 'X' }),
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

describe('MetraCardsApiClient.getDeck', () => {
  it('GETs /decks/{id} with Bearer', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedAuth: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedAuth = new Headers(init?.headers).get('Authorization');
      return new Response(JSON.stringify({ id: 'd1', name: 'A', due_count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.getDeck('d1');
      assert.equal(capturedUrl, 'http://example.test/decks/d1');
      assert.equal(capturedAuth, 'Bearer tok');
      assert.deepEqual(result, { id: 'd1', name: 'A', due_count: 0 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.updateDeck', () => {
  it('PUTs /decks/{id} with Bearer and body', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody: string | null = null;
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      capturedBody = typeof init?.body === 'string' ? init.body : null;
      return new Response(JSON.stringify({ id: 'd1', name: 'B' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const body = { name: 'B' };
      const result = await client.updateDeck('d1', body);
      assert.equal(capturedMethod, 'PUT');
      assert.equal(capturedUrl, 'http://example.test/decks/d1');
      assert.equal(capturedBody, JSON.stringify(body));
      assert.deepEqual(result, { id: 'd1', name: 'B' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MetraCardsApiClient.deleteDeck', () => {
  it('DELETEs /decks/{id} with Bearer', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedMethod = '';
    globalThis.fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method ?? 'GET';
      return new Response(
        JSON.stringify({ message: 'Deck deleted successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    try {
      const client = new MetraCardsApiClient('http://example.test', {
        getIdToken: async () => 'tok',
        clearCache: () => undefined,
      });
      const result = await client.deleteDeck('d1');
      assert.equal(capturedMethod, 'DELETE');
      assert.equal(capturedUrl, 'http://example.test/decks/d1');
      assert.deepEqual(result, { message: 'Deck deleted successfully' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

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
