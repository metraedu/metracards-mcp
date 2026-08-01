# MetraCards MCP Boilerplate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Node + TypeScript MCP server that exposes `health_check` against `metracards_api` GET `/health`, with stdio transport now and an HTTP entrypoint stub for later.

**Architecture:** Layered `config` → `clients` → `tools` → `server` → transport entrypoints. Tools and API client are transport-agnostic. Config loads from `.env` via dotenv (`METRACARDS_API_URL`, default `http://127.0.0.1:3001`).

**Tech Stack:** Node 20+, TypeScript, `@modelcontextprotocol/server` (SDK v2), `zod` (v4), `dotenv`, native `fetch`.

## Global Constraints

- MCP package: use `@modelcontextprotocol/server` (v2 stable), not the legacy monolith `@modelcontextprotocol/sdk` named in the early design table — same capabilities, current API (`McpServer`, `serveStdio`, `registerTool`).
- Log only with `console.error` on stdio entry (stdout is the MCP channel).
- Tool name must be exactly `health_check`.
- Default API URL: `http://127.0.0.1:3001`.
- No auth in v1.
- README must document Cursor + Claude Desktop + Claude Code install.
- Repo may need `git init` before first commit; skip commit steps if the user has not asked to commit / git is unavailable.
- Spec: `docs/superpowers/specs/2026-08-01-mcp-boilerplate-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `package.json` | Scripts, deps, `"type": "module"` |
| `tsconfig.json` | Strict ESM compile to `dist/` |
| `.gitignore` | `node_modules`, `dist`, `.env` |
| `.env.example` | Documents `METRACARDS_API_URL` |
| `src/config/index.ts` | Load dotenv; export `config` |
| `src/clients/metracards-api.ts` | `MetraCardsApiClient.getHealth()` |
| `src/tools/health-check.ts` | Register `health_check` on `McpServer` |
| `src/server/create-server.ts` | Build server + register tools |
| `src/index.ts` | stdio entry via `serveStdio` |
| `src/http.ts` | HTTP stub (throws clear error / exits 1) |
| `README.md` | Setup + Cursor/Claude install |
| `src/clients/metracards-api.test.ts` | Unit tests for client (mocked fetch) |

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Consumes: nothing
- Produces: npm project that can `npm install` and typecheck empty `src` later

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "metracards-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "MCP server for MetraCards API",
  "bin": {
    "metracards-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "start:stdio": "node dist/index.js",
    "start:http": "node dist/http.js",
    "dev": "tsc --watch",
    "test": "node --experimental-strip-types --test src/**/*.test.ts"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "dist", "node_modules"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
.DS_Store
```

- [ ] **Step 4: Create `.env.example`**

```
METRACARDS_API_URL=http://127.0.0.1:3001
```

- [ ] **Step 5: Install dependencies**

Run from `/Users/gabriel/projects/metracards-mcp`:

```bash
npm install @modelcontextprotocol/server zod dotenv
npm install -D typescript @types/node
```

Expected: `package-lock.json` created; no errors.

- [ ] **Step 6: Commit (only if git exists and user wants commits)**

```bash
git init   # if needed
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "$(cat <<'EOF'
chore: scaffold metracards-mcp Node TypeScript project

EOF
)"
```

---

### Task 2: Config + API client

**Files:**
- Create: `src/config/index.ts`
- Create: `src/clients/metracards-api.ts`
- Create: `src/clients/metracards-api.test.ts`
- Test: `src/clients/metracards-api.test.ts`

**Interfaces:**
- Consumes: `process.env.METRACARDS_API_URL`, dotenv
- Produces:
  - `export type AppConfig = { apiUrl: string }`
  - `export function loadConfig(): AppConfig`
  - `export const config: AppConfig` (eager load after dotenv)
  - `export type HealthResponse = { status: string; timestamp: string; service: string }`
  - `export class MetraCardsApiError extends Error` with `statusCode?: number`, `body?: string`
  - `export class MetraCardsApiClient { constructor(baseUrl: string); getHealth(): Promise<HealthResponse> }`

- [ ] **Step 1: Write failing client test**

Create `src/clients/metracards-api.test.ts`:

```typescript
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
    globalThis.fetch = async () =>
      new Response('nope', { status: 503 });

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
```

- [ ] **Step 2: Run test — expect fail (module missing)**

```bash
npm test
```

Expected: FAIL — cannot find `./metracards-api.ts` or similar.

- [ ] **Step 3: Implement config**

Create `src/config/index.ts`:

```typescript
import { config as loadDotenv } from 'dotenv';

loadDotenv();

export type AppConfig = {
  apiUrl: string;
};

export function loadConfig(): AppConfig {
  const apiUrl =
    process.env.METRACARDS_API_URL?.trim() || 'http://127.0.0.1:3001';
  return { apiUrl: apiUrl.replace(/\/$/, '') };
}

export const config = loadConfig();
```

- [ ] **Step 4: Implement API client**

Create `src/clients/metracards-api.ts`:

```typescript
export type HealthResponse = {
  status: string;
  timestamp: string;
  service: string;
};

export class MetraCardsApiError extends Error {
  readonly statusCode?: number;
  readonly body?: string;

  constructor(message: string, options?: { statusCode?: number; body?: string }) {
    super(message);
    this.name = 'MetraCardsApiError';
    this.statusCode = options?.statusCode;
    this.body = options?.body;
  }
}

export class MetraCardsApiClient {
  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<HealthResponse> {
    const url = `${this.baseUrl}/health`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MetraCardsApiError(`Failed to reach MetraCards API at ${url}: ${message}`);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new MetraCardsApiError(
        `MetraCards API health returned HTTP ${response.status}`,
        { statusCode: response.status, body: text.slice(0, 500) },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new MetraCardsApiError('MetraCards API health returned invalid JSON', {
        statusCode: response.status,
        body: text.slice(0, 500),
      });
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as HealthResponse).status !== 'string' ||
      typeof (parsed as HealthResponse).timestamp !== 'string' ||
      typeof (parsed as HealthResponse).service !== 'string'
    ) {
      throw new MetraCardsApiError('MetraCards API health payload missing required fields', {
        statusCode: response.status,
        body: text.slice(0, 500),
      });
    }

    return parsed as HealthResponse;
  }
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test
```

Expected: both tests PASS.

- [ ] **Step 6: Commit (if applicable)**

```bash
git add src/config/index.ts src/clients/metracards-api.ts src/clients/metracards-api.test.ts
git commit -m "$(cat <<'EOF'
feat: add config and MetraCards API health client

EOF
)"
```

---

### Task 3: MCP server, health tool, stdio + HTTP stub

**Files:**
- Create: `src/tools/health-check.ts`
- Create: `src/server/create-server.ts`
- Create: `src/index.ts`
- Create: `src/http.ts`

**Interfaces:**
- Consumes: `MetraCardsApiClient`, `config`, `McpServer` from `@modelcontextprotocol/server`
- Produces:
  - `export function registerHealthCheck(server: McpServer, client: MetraCardsApiClient): void`
  - `export function createServer(client?: MetraCardsApiClient): McpServer`
  - stdio process via `serveStdio(() => createServer())`
  - `src/http.ts` exits with message that HTTP transport is not implemented yet

- [ ] **Step 1: Implement health tool registration**

Create `src/tools/health-check.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  MetraCardsApiClient,
  MetraCardsApiError,
} from '../clients/metracards-api.js';

export function registerHealthCheck(
  server: McpServer,
  client: MetraCardsApiClient,
): void {
  server.registerTool(
    'health_check',
    {
      description: 'Check whether MetraCards API is healthy',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const health = await client.getHealth();
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(health, null, 2) }],
        };
      } catch (err) {
        const message =
          err instanceof MetraCardsApiError
            ? JSON.stringify(
                {
                  error: err.message,
                  statusCode: err.statusCode ?? null,
                  body: err.body ?? null,
                },
                null,
                2,
              )
            : err instanceof Error
              ? err.message
              : String(err);

        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    },
  );
}
```

- [ ] **Step 2: Implement `createServer`**

Create `src/server/create-server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/server';
import { MetraCardsApiClient } from '../clients/metracards-api.js';
import { config } from '../config/index.js';
import { registerHealthCheck } from '../tools/health-check.js';

export function createServer(
  client: MetraCardsApiClient = new MetraCardsApiClient(config.apiUrl),
): McpServer {
  const server = new McpServer({
    name: 'metracards-mcp',
    version: '0.1.0',
  });

  registerHealthCheck(server, client);
  return server;
}
```

- [ ] **Step 3: Implement stdio entry**

Create `src/index.ts`:

```typescript
#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server/create-server.js';
import { config } from './config/index.js';

console.error(
  `metracards-mcp listening on stdio (API: ${config.apiUrl})`,
);

serveStdio(() => createServer());
```

- [ ] **Step 4: Implement HTTP stub**

Create `src/http.ts`:

```typescript
#!/usr/bin/env node
console.error(
  'HTTP/SSE transport is not implemented yet. Use stdio entry: npm run start:stdio',
);
process.exit(1);
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: `dist/` with compiled JS; no TypeScript errors.

If `zod/v4` import fails, adjust to the package’s documented import (`zod` or `zod/v4`) until `tsc` passes — keep `inputSchema: z.object({})`.

- [ ] **Step 6: Smoke against live API (optional if SAM is up)**

```bash
curl -sf http://127.0.0.1:3001/health
npx @modelcontextprotocol/inspector node ./dist/index.js
```

Expected: curl returns `{"status":"ok",...}`; Inspector lists `health_check` and calling it returns the same payload.

- [ ] **Step 7: Commit (if applicable)**

```bash
git add src/tools/health-check.ts src/server/create-server.ts src/index.ts src/http.ts
git commit -m "$(cat <<'EOF'
feat: wire health_check tool over stdio MCP transport

EOF
)"
```

---

### Task 4: README (Cursor + Claude install)

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: built `dist/index.js` path, `METRACARDS_API_URL`
- Produces: documented install for Cursor, Claude Desktop, Claude Code

- [ ] **Step 1: Write `README.md`**

```markdown
# metracards-mcp

MCP server for [MetraCards API](../metracards_api). Exposes tools that call the API.

Current tools:

| Tool | API |
|------|-----|
| `health_check` | `GET /health` |

## Prerequisites

- Node.js 20+
- MetraCards API reachable (local SAM: `http://127.0.0.1:3001`)

## Setup

```bash
cd metracards-mcp
npm install
cp .env.example .env   # optional; defaults to http://127.0.0.1:3001
npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` / `npm run start:stdio` | Run MCP over stdio |
| `npm run start:http` | HTTP transport stub (not implemented yet) |
| `npm test` | Unit tests |

## Install in Cursor

1. Build this package (`npm run build`).
2. Open Cursor Settings → MCP, or edit the project file `.cursor/mcp.json` (or global `~/.cursor/mcp.json`).
3. Add:

```json
{
  "mcpServers": {
    "metracards": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js"],
      "env": {
        "METRACARDS_API_URL": "http://127.0.0.1:3001"
      }
    }
  }
}
```

4. Replace `/ABSOLUTE/PATH/TO/metracards-mcp` with the real path.
5. Restart MCP / reload Cursor and confirm the `metracards` server is connected.
6. Ask the agent to run `health_check`.

## Install in Claude Desktop

1. Build this package (`npm run build`).
2. Edit the Claude Desktop config:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`
3. Add under `mcpServers`:

```json
{
  "mcpServers": {
    "metracards": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js"],
      "env": {
        "METRACARDS_API_URL": "http://127.0.0.1:3001"
      }
    }
  }
}
```

4. Fully quit and reopen Claude Desktop.
5. Confirm tools are available and call `health_check`.

## Install in Claude Code

From the project directory (or with absolute path):

```bash
claude mcp add metracards --env METRACARDS_API_URL=http://127.0.0.1:3001 -- node /ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js
```

Or add the same `command` / `args` / `env` block to your Claude Code MCP settings JSON.

## Pointing at another API URL

Set `METRACARDS_API_URL` in `.env` (for local runs) or in the MCP `env` block (Cursor / Claude). No trailing slash.

## HTTP transport

`npm run start:http` is a stub. Use stdio for Cursor and Claude until HTTP/SSE is implemented.
```

- [ ] **Step 2: Sanity-check paths in README match real scripts**

Confirm `package.json` scripts names match the README table.

- [ ] **Step 3: Commit (if applicable)**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add setup and Cursor/Claude MCP install guide

EOF
)"
```

---

### Task 5: End-to-end verification

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Clean build + tests**

```bash
cd /Users/gabriel/projects/metracards-mcp
npm test
npm run build
```

Expected: tests pass; `dist/index.js` exists.

- [ ] **Step 2: Verify health via client against live API (if SAM running)**

```bash
node --input-type=module -e "
import { MetraCardsApiClient } from './dist/clients/metracards-api.js';
const c = new MetraCardsApiClient('http://127.0.0.1:3001');
console.log(await c.getHealth());
"
```

Expected: `{ status: 'ok', timestamp: '...', service: 'metracards-api' }`.

- [ ] **Step 3: Verify HTTP stub exits 1**

```bash
npm run start:http; echo exit:$?
```

Expected: message on stderr; exit code `1`.

- [ ] **Step 4: Mark success criteria from the spec**

1. `npm install && npm run build` succeeds  
2. `health_check` returns API health when API is up  
3. New tool = file under `src/tools` + register in `create-server.ts`  
4. HTTP later = implement `src/http.ts` only  

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Node + TS + MCP SDK | 1, 3 |
| stdio now | 3 |
| HTTP stub later | 3 |
| Tool `health_check` only | 3 |
| `.env` + `METRACARDS_API_URL` | 1, 2 |
| Layered layout | 2, 3 |
| Error handling without crashing process | 3 (`isError: true`) |
| README Cursor + Claude | 4 |
| Success criteria | 5 |

## Placeholder / consistency notes

- Use `.js` extensions in relative imports (NodeNext ESM).
- Tool registration import path for zod: prefer `zod/v4` per SDK docs; fall back only if install resolves differently.
- Commit steps are optional per user git preference; `git init` required once if committing.
