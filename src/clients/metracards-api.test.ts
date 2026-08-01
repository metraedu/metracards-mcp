import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetraCardsApiClient, MetraCardsApiError } from './metracards-api.ts';

describe('MetraCardsApiClient.getHealth', () => {
  it('returns parsed health payload on 200', async () => {
    const payload = {
      status: 'ok',
      timestamp: '2026-08-01T00:00:00.000Z',
      service: 'metracards-api',
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    try {
      const client = new MetraCardsApiClient('http://example.test');
      const result = await client.getHealth();
      assert.deepEqual(result, payload);
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
