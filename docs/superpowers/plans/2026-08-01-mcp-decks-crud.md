# MetraCards MCP Decks CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated deck CRUD MCP tools (`decks_list`, `decks_get`, `decks_create`, `decks_update`, `decks_delete`) that call `metracards_api` with the same Bearer contract as metracards-web.

**Architecture:** Extend `MetraCardsApiClient` with five authenticated deck methods (reuse existing `request` + 401 retry). Register thin MCP tools in `src/tools/decks.ts` that map zod inputs to client calls and return JSON text results. Wire via `create-server.ts`.

**Tech Stack:** Node 20+, TypeScript, native `fetch`, existing MCP SDK + zod + `MetraCardsApiClient` / `AuthRequiredError`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-mcp-decks-crud-design.md`
- Depends on auth already working (`TokenProvider`, Bearer on `MetraCardsApiClient`, `auth_login`)
- Field contract mirrors API snake_case; no color remapping; no camelCase
- Tools never log or return tokens
- Log only with `console.error` on stdio
- Tests: `npm test` → `node --experimental-strip-types --test src/**/*.test.ts`
- Skip git commit steps unless the user asked to commit
- Out of scope: batch, deleted, cards, review, API/web changes

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/clients/metracards-api.ts` | Deck request/response types + 5 authenticated methods |
| `src/clients/metracards-api.test.ts` | Unit tests for deck client methods |
| `src/tools/decks.ts` | Register `decks_*` tools |
| `src/server/create-server.ts` | Call `registerDecksTools` |
| `README.md` | Document deck tools |

---

### Task 1: API client — list + create

**Files:**
- Modify: `src/clients/metracards-api.ts`
- Modify: `src/clients/metracards-api.test.ts`

**Interfaces:**
- Consumes: existing `request(pathname, init, { auth: true })`, `MetraCardsApiError`
- Produces:
  - `CreateDeckBody = { id?: string; name: string; description?: string | null; color?: string; daily_new_cards_limit?: number }`
  - `listDecks(since?: string): Promise<unknown>`
  - `createDeck(body: CreateDeckBody): Promise<unknown>`
  - private helper `readJsonOrThrow(response, label): Promise<unknown>` (pass-through JSON; throw on non-2xx / invalid JSON)

- [ ] **Step 1: Write failing tests for `listDecks` and `createDeck`**

Append to `src/clients/metracards-api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test`

Expected: FAIL — `listDecks` / `createDeck` not defined on client.

- [ ] **Step 3: Implement types + helper + `listDecks` + `createDeck`**

In `src/clients/metracards-api.ts`, add:

```ts
export type CreateDeckBody = {
  id?: string;
  name: string;
  description?: string | null;
  color?: string;
  daily_new_cards_limit?: number;
};
```

Add private method on the class:

```ts
private async readJsonOrThrow(
  response: Response,
  label: string,
): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new MetraCardsApiError(
      `MetraCards API ${label} returned HTTP ${response.status}`,
      { statusCode: response.status, body: text.slice(0, 500) },
    );
  }
  if (text.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MetraCardsApiError(
      `MetraCards API ${label} returned invalid JSON`,
      { statusCode: response.status, body: text.slice(0, 500) },
    );
  }
}
```

Implement:

```ts
async listDecks(since?: string): Promise<unknown> {
  const query =
    since !== undefined && since !== ''
      ? `?since=${encodeURIComponent(since)}`
      : '';
  const response = await this.request(
    `/decks${query}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'list decks');
}

async createDeck(body: CreateDeckBody): Promise<unknown> {
  const response = await this.request(
    '/decks',
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
  return this.readJsonOrThrow(response, 'create deck');
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test`

Expected: PASS for list/create deck tests (and existing health/upsert tests).

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/clients/metracards-api.ts src/clients/metracards-api.test.ts
git commit -m "feat: add listDecks and createDeck to API client"
```

---

### Task 2: API client — get, update, delete

**Files:**
- Modify: `src/clients/metracards-api.ts`
- Modify: `src/clients/metracards-api.test.ts`

**Interfaces:**
- Consumes: `readJsonOrThrow`, `request(..., { auth: true })`
- Produces:
  - `UpdateDeckBody = { name?: string; description?: string | null; color?: string; daily_new_cards_limit?: number }`
  - `getDeck(id: string): Promise<unknown>`
  - `updateDeck(id: string, body: UpdateDeckBody): Promise<unknown>`
  - `deleteDeck(id: string): Promise<unknown>`

- [ ] **Step 1: Write failing tests**

Append:

```ts
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
```

- [ ] **Step 2: Run tests — expect fail**

Run: `npm test`

Expected: FAIL — `getDeck` / `updateDeck` / `deleteDeck` missing.

- [ ] **Step 3: Implement methods**

```ts
export type UpdateDeckBody = {
  name?: string;
  description?: string | null;
  color?: string;
  daily_new_cards_limit?: number;
};

async getDeck(id: string): Promise<unknown> {
  const response = await this.request(
    `/decks/${encodeURIComponent(id)}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'get deck');
}

async updateDeck(id: string, body: UpdateDeckBody): Promise<unknown> {
  const response = await this.request(
    `/decks/${encodeURIComponent(id)}`,
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
  return this.readJsonOrThrow(response, 'update deck');
}

async deleteDeck(id: string): Promise<unknown> {
  const response = await this.request(
    `/decks/${encodeURIComponent(id)}`,
    { method: 'DELETE', headers: { Accept: 'application/json' } },
    { auth: true },
  );
  return this.readJsonOrThrow(response, 'delete deck');
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/clients/metracards-api.ts src/clients/metracards-api.test.ts
git commit -m "feat: add getDeck, updateDeck, and deleteDeck to API client"
```

---

### Task 3: MCP tools + wire + README

**Files:**
- Create: `src/tools/decks.ts`
- Modify: `src/server/create-server.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `MetraCardsApiClient` deck methods from Tasks 1–2; `AuthRequiredError` from `../auth/token-provider.js`; `MetraCardsApiError`
- Produces: `registerDecksTools(server: McpServer, client: MetraCardsApiClient): void`

- [ ] **Step 1: Implement `src/tools/decks.ts`**

Use `import { z } from 'zod'` (same as `auth.ts`). Shared helpers:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { AuthRequiredError } from '../auth/token-provider.js';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from '../clients/metracards-api.js';

const colorSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{8}$/, 'color must be 8 hex chars (ARGB)');

const uuidSchema = z.string().uuid();

function textResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function mapToolError(err: unknown) {
  if (err instanceof AuthRequiredError) {
    return textResult(
      {
        ok: false,
        error: err.message || 'Not authenticated',
        hint: 'Call auth_login to sign in before using deck tools.',
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
  const message = err instanceof Error ? err.message : String(err);
  return textResult({ ok: false, error: message }, true);
}

export function registerDecksTools(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'decks_list',
    {
      description: 'List decks for the authenticated MetraCards user',
      inputSchema: z.object({
        since: z.string().datetime({ offset: true }).optional(),
      }),
    },
    async ({ since }) => {
      try {
        const decks = await client.listDecks(since);
        return textResult(decks);
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_get',
    {
      description: 'Get a deck by id (includes detail fields from the API)',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.getDeck(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_create',
    {
      description: 'Create a deck for the authenticated user',
      inputSchema: z.object({
        id: uuidSchema.optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async (input) => {
      try {
        return textResult(await client.createDeck(input));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_update',
    {
      description: 'Update a deck by id',
      inputSchema: z.object({
        id: uuidSchema,
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        color: colorSchema.optional(),
        daily_new_cards_limit: z.number().int().min(1).optional(),
      }),
    },
    async ({ id, ...body }) => {
      try {
        return textResult(await client.updateDeck(id, body));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );

  server.registerTool(
    'decks_delete',
    {
      description: 'Soft-delete a deck by id',
      inputSchema: z.object({ id: uuidSchema }),
    },
    async ({ id }) => {
      try {
        return textResult(await client.deleteDeck(id));
      } catch (err) {
        return mapToolError(err);
      }
    },
  );
}
```

Notes:
- For `since`, if `z.string().datetime({ offset: true })` rejects valid API ISO strings used in practice, fall back to `z.string().min(1)` (API validates ISO8601).
- Pass `create` input through as-is (snake_case fields already match `CreateDeckBody`).
- `decks_update` must not send `id` in the PUT body — destructure `{ id, ...body }`.

- [ ] **Step 2: Wire in `create-server.ts`**

```ts
import { registerDecksTools } from '../tools/decks.js';

// after registerAuthTools(...):
registerDecksTools(server, apiClient);
```

- [ ] **Step 3: Update README tools table**

Add rows:

| Tool | API / behavior |
|------|----------------|
| `decks_list` | `GET /decks` (auth; optional `since`) |
| `decks_get` | `GET /decks/{id}` (auth) |
| `decks_create` | `POST /decks` (auth) |
| `decks_update` | `PUT /decks/{id}` (auth) |
| `decks_delete` | `DELETE /decks/{id}` (auth) |

Mention that deck tools require prior `auth_login`.

- [ ] **Step 4: Build + test**

Run:

```bash
npm test
npm run build
```

Expected: all tests PASS; `tsc` succeeds; `dist/tools/decks.js` exists.

- [ ] **Step 5: Manual smoke (optional if API + auth available)**

1. Ensure MCP process has Firebase env + API up.
2. `auth_login` → `decks_list` → `decks_create` `{ "name": "MCP Test" }` → `decks_get` → `decks_update` → `decks_delete`.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/tools/decks.ts src/server/create-server.ts README.md
git commit -m "feat: add decks CRUD MCP tools"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `listDecks` / `GET /decks` + optional `since` | Task 1 + 3 |
| `getDeck` / `GET /decks/{id}` | Task 2 + 3 |
| `createDeck` / `POST /decks` | Task 1 + 3 |
| `updateDeck` / `PUT /decks/{id}` | Task 2 + 3 |
| `deleteDeck` / `DELETE /decks/{id}` | Task 2 + 3 |
| One tool per operation, snake_case mirror | Task 3 |
| Auth required + `auth_login` hint | Task 3 `mapToolError` |
| API error `statusCode` + truncated body | Task 1 helper + Task 3 |
| Client unit tests (create + read + non-2xx) | Tasks 1–2 |
| README + `create-server` wire | Task 3 |
| Out of scope (batch/cards/review) | Not implemented |
