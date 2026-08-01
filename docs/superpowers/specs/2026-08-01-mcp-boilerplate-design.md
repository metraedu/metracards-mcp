# MetraCards MCP — Boilerplate Design

**Date:** 2026-08-01  
**Status:** Approved (pending implementation plan)  
**Repo:** `metracards-mcp`

## Goal

Create a Node.js + TypeScript MCP server that talks to `metracards_api`. First scope: map only `GET /health` as a tool. Structure must support stdio today and HTTP/SSE later without rewriting tools or the API client.

## Decisions

| Topic | Choice |
|-------|--------|
| Stack | Node + TypeScript + `@modelcontextprotocol/server` (SDK v2) |
| Primary transport | stdio (Cursor / local clients) |
| Future transport | Separate HTTP/SSE entrypoint; same server/tools |
| Health exposure | Tool `health_check` only (no MCP resource) |
| API base URL | `.env` + dotenv; `METRACARDS_API_URL` (default `http://127.0.0.1:3001`) |
| Project layout | Layered: `config` / `clients` / `tools` / `server` |

## Architecture

```
Cursor (or other MCP client)
        │ stdio
        ▼
┌───────────────────────────┐
│  entry: stdio (now)       │
│  entry: http  (later)     │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  MCP server + tools       │
│  health_check             │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│  MetraCards API client    │
│  GET /health              │
└─────────────┬─────────────┘
              │
              ▼
        metracards_api
```

### Components

1. **`src/config`** — Load dotenv, expose typed config (`apiUrl`, timeouts if needed). Fail fast on invalid URL if we add validation later; for v1, default + env override is enough.
2. **`src/clients/metracards-api`** — Thin HTTP client. Method `getHealth()` → `GET {apiUrl}/health`. No business logic beyond request/response parsing and error mapping.
3. **`src/tools/health-check`** — Registers the MCP tool; calls the client; returns JSON text content for the agent.
4. **`src/server`** — Builds the `McpServer`, registers tools. Transport-agnostic.
5. **Entrypoints**
   - `src/index.ts` (or `src/stdio.ts`) — stdio transport (implemented now).
   - `src/http.ts` — HTTP/SSE stub or minimal scaffold (documented as not production-ready until needed).

### Data flow (`health_check`)

1. Client invokes tool `health_check` (no required args).
2. Tool calls `apiClient.getHealth()`.
3. On HTTP 200 with body `{ status, timestamp, service }`, return that payload as tool result text (JSON stringified).
4. On network/HTTP failure, return a structured error message in the tool result (do not crash the MCP process).

## API contract (upstream)

- **Method / path:** `GET /health`
- **Local base:** `http://127.0.0.1:3001` (SAM local)
- **Success body (200):**

```json
{
  "status": "ok",
  "timestamp": "<ISO-8601>",
  "service": "metracards-api"
}
```

No auth for health in v1.

## Tool contract

| Field | Value |
|-------|--------|
| Name | `health_check` |
| Description | Check whether MetraCards API is healthy |
| Input schema | Empty object (no properties) |
| Output | JSON string with API health payload, or error details |

## Project skeleton (target)

```
metracards-mcp/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── docs/superpowers/specs/
│   └── 2026-08-01-mcp-boilerplate-design.md
└── src/
    ├── index.ts              # stdio entry
    ├── http.ts               # HTTP/SSE scaffold (later)
    ├── config/
    │   └── index.ts
    ├── clients/
    │   └── metracards-api.ts
    ├── tools/
    │   └── health-check.ts
    └── server/
        └── create-server.ts
```

## Scripts & DX

- `npm run build` — compile TypeScript
- `npm start` / `npm run start:stdio` — run stdio server
- `npm run start:http` — run HTTP scaffold (optional / stub)
- `.env.example` documents `METRACARDS_API_URL`
- README must include install instructions for:
  - **Cursor** — `mcp.json` (project or global), command pointing at the built stdio entry, `env` with `METRACARDS_API_URL`
  - **Claude** — Claude Desktop `claude_desktop_config.json` (and note Claude Code MCP config if applicable), same stdio command + env
  - Prerequisites: Node, `npm install` / `npm run build`, API reachable (e.g. SAM local)

## Error handling

- API unreachable / non-2xx: tool returns error content; process stays up.
- Invalid JSON from API: treat as error with status and raw snippet if useful.
- No retries in v1 (keep boilerplate simple).

## Out of scope (v1)

- Auth / API keys
- Other API routes
- MCP resources / prompts
- Production HTTP deployment, auth on the MCP HTTP surface
- Automated test suite beyond optional smoke (can add later)
- Publishing to npm registry

## Success criteria

1. `npm install && npm run build` succeeds.
2. With SAM local (or any API) at `METRACARDS_API_URL`, Cursor can call `health_check` and get `{ status: "ok", ... }`.
3. Adding a new tool = new file under `src/tools` + one register call; no transport changes.
4. Switching to HTTP later = implement `src/http.ts` without changing the API client or `health_check` logic.
