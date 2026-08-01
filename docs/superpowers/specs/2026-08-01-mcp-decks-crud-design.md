# MetraCards MCP — Decks CRUD Design

**Date:** 2026-08-01  
**Status:** Approved  
**Repo:** `metracards-mcp`  
**Depends on:** `2026-08-01-mcp-auth-design.md`

## Goal

Expose authenticated deck CRUD tools on the MCP server that call `metracards_api` with the same Bearer contract as `metracards-web`, so an agent can list, get, create, update, and delete decks for the logged-in user.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope (v1) | Basic CRUD only: list, get, create, update, delete |
| Tool surface | One tool per operation: `decks_list`, `decks_get`, `decks_create`, `decks_update`, `decks_delete` |
| Field contract | Mirror API (snake_case; `color` as 8-char hex ARGB; optional `id` on create) |
| Client layout | Extend existing `MetraCardsApiClient` |
| Response shape | Pass through API JSON (no camelCase remap) |
| Auth | Required; reuse token provider + 401 retry |

## Architecture

```
Agent / Cursor
      │ stdio
      ▼
┌─────────────────────────────────────┐
│  MCP server                         │
│  decks_list / get / create /        │
│  update / delete (+ existing auth)  │
└──────────────────┬──────────────────┘
                   │ Bearer via TokenProvider
                   ▼
         MetraCardsApiClient
                   │
                   ▼
            metracards_api
         /decks , /decks/{id}
```

### Components

1. **`MetraCardsApiClient`** — Add authenticated methods:
   - `listDecks(since?: string)` → `GET /decks?since=`
   - `getDeck(id)` → `GET /decks/{id}`
   - `createDeck(body)` → `POST /decks`
   - `updateDeck(id, body)` → `PUT /decks/{id}`
   - `deleteDeck(id)` → `DELETE /decks/{id}`
2. **`src/tools/decks.ts`** — Register the five tools with zod `inputSchema`; return `JSON.stringify` text results (same pattern as auth/health).
3. **`create-server.ts`** — Call `registerDecksTools(server, apiClient)`.
4. **`README.md`** — Document the new tools in the tools table.

## Tool contracts

| Tool | API | Input | Success output |
|------|-----|-------|----------------|
| `decks_list` | `GET /decks` | optional `since` (ISO8601) | `DeckResponse[]` |
| `decks_get` | `GET /decks/{id}` | `id` (UUID) | `DeckDetailResponse` |
| `decks_create` | `POST /decks` | `name` required; optional `id`, `description`, `color` (`^[0-9A-Fa-f]{8}$`), `daily_new_cards_limit` (≥ 1) | deck entity / API payload |
| `decks_update` | `PUT /decks/{id}` | `id` + optional body fields (`name`, `description`, `color`, `daily_new_cards_limit`) | deck entity / API payload |
| `decks_delete` | `DELETE /decks/{id}` | `id` | API JSON (e.g. `{ message }`) |

Upstream field names and validation match `metracards_api` Joi schemas for create/update. MCP does not normalize colors or rename fields.

## Error handling

| Case | Behavior |
|------|----------|
| Not logged in / `AuthRequiredError` | Tool returns `isError` with actionable hint to call `auth_login` |
| API non-2xx | `isError` with `MetraCardsApiError` message, `statusCode`, truncated `body` |
| Zod input invalid | MCP SDK schema rejection |
| Network failure | `MetraCardsApiError` from existing client `request` helper |

## Testing

- Unit tests on `MetraCardsApiClient` for deck methods: assert path, method, Bearer header, and JSON body (at least create + one read); assert `MetraCardsApiError` on non-2xx.
- Manual smoke: `auth_login` → `decks_list` → `decks_create` → `decks_get` → `decks_update` → `decks_delete`.

## Out of scope

- Batch create/delete, deleted decks, list cards / categories, review next/answer
- Changes to `metracards_api` or `metracards-web`
- HTTP/SSE MCP transport
- CamelCase or ergonomic color aliases in tool inputs

## Success criteria

After `auth_login`, an agent can manage the user's decks end-to-end via the five MCP tools against a reachable MetraCards API, with the same auth and payload shapes as the web app's deck API calls.
