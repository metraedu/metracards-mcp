# MetraCards MCP — Cards CRUD (+ Media) Design

**Date:** 2026-08-01  
**Status:** Approved  
**Repo:** `metracards-mcp`  
**Depends on:** `2026-08-01-mcp-auth-design.md`, `2026-08-01-mcp-decks-crud-design.md`

## Goal

Expose authenticated flashcard CRUD tools on the MCP server that call `metracards_api` with the same Bearer and snake_case contract as `metracards-web`, plus media upload (local file path) and TTS audio generation (`POST /audio` → S3), so an agent can manage cards end-to-end including optional audio/image.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope (v1) | Basic CRUD + `cards_upload_media` + `cards_generate_audio` |
| Tool naming | `cards_*` (not `flashcards_*`); API path remains `/flashcards` |
| Tool surface | Seven tools: list, get, create, update, delete, upload_media, generate_audio |
| Field contract | Mirror API/web (snake_case; optional media keys/sizes on create/update) |
| Upload source | Absolute local `file_path` read by the MCP process |
| Audio TTS | `POST /audio` then upload bytes via the same presign+PUT path as web |
| Client layout | Extend existing `MetraCardsApiClient`; shared media helper |
| Response shape | Pass through API JSON (no camelCase remap) |
| Auth | Required; reuse token provider + 401 retry; `uid` from CredentialStore for S3 keys |

## Architecture

```
Agent / Cursor
      │ stdio
      ▼
┌──────────────────────────────────────────────┐
│  MCP server                                  │
│  cards_list / get / create / update / delete │
│  cards_upload_media / cards_generate_audio   │
└──────────────────┬───────────────────────────┘
                   │ Bearer via TokenProvider
                   │ uid via CredentialStore
                   ▼
         MetraCardsApiClient + media helper
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  /flashcards   /s3/presigned-url   /audio
                   │
                   ▼
                 S3 PUT
```

### Components

1. **`MetraCardsApiClient`** — Add authenticated methods:
   - `listFlashcards({ deck_id?, since? })` → `GET /flashcards`
   - `getFlashcard(id)` → `GET /flashcards/{id}`
   - `createFlashcard(body)` → `POST /flashcards`
   - `updateFlashcard(id, body)` → `PUT /flashcards/{id}`
   - `deleteFlashcard(id)` → `DELETE /flashcards/{id}`
   - `createPresignedUrl({ action, key, contentType? })` → `POST /s3/presigned-url`
   - `generateAudio({ text, language })` → `POST /audio` (returns base64 audio + language)
2. **`src/media/upload.ts`** — Build key `users/{uid}/flashcards/{flashcardId}/{side}-{kind}-{ts}.{ext}`, read local file (or Buffer from TTS), call `createPresignedUrl` (`putObject`), `PUT` to S3, return `{ key, size }`.
3. **`src/tools/cards.ts`** — Register the seven tools with zod `inputSchema`; return `JSON.stringify` text results (same pattern as decks/auth).
4. **`create-server.ts`** — Call `registerCardsTools(server, apiClient, store)` (store needed for `uid`).
5. **`README.md`** — Document the new tools in the tools table.

## Tool contracts

| Tool | API / action | Input | Success output |
|------|--------------|-------|----------------|
| `cards_list` | `GET /flashcards` | optional `deck_id` (UUID), `since` (ISO8601) | flashcard array |
| `cards_get` | `GET /flashcards/{id}` | `id` (UUID) | flashcard entity |
| `cards_create` | `POST /flashcards` | `deck_id`, `front`, `back` required; optional `id`, `category`, media keys/sizes | flashcard entity |
| `cards_update` | `PUT /flashcards/{id}` | `id` + optional body fields (text, category, media, SRS fields if passed) | flashcard entity |
| `cards_delete` | `DELETE /flashcards/{id}` | `id` | API JSON (e.g. `{ message }`) |
| `cards_upload_media` | presign + S3 PUT | `flashcard_id`, `side` (`front`\|`back`), `kind` (`audio`\|`image`), `file_path` (absolute) | `{ key, size }` |
| `cards_generate_audio` | `POST /audio` → upload | `flashcard_id`, `side`, `text`, `language` | `{ key, size, language }` |

### Media workflow (mirrors web)

1. Agent generates a UUID for the card (or reuses an existing id when updating).
2. Call `cards_upload_media` and/or `cards_generate_audio` (S3 key uses stored `uid`).
3. Call `cards_create` or `cards_update` with returned keys and sizes mapped to API fields:
   - front audio → `audio_file_url` / `audio_file_size`
   - front image → `image_file_url` / `image_file_size`
   - back audio → `back_audio_file_url` / `back_audio_file_size`
   - back image → `back_image_file_url` / `back_image_file_size`

Upstream field names match `metracards_api` Joi / web payloads. MCP does not rename fields to camelCase.

## Error handling

| Case | Behavior |
|------|----------|
| Not logged in / `AuthRequiredError` | Tool returns `isError` with actionable hint to call `auth_login` |
| Local `file_path` missing / unreadable | `isError` with clear message |
| API non-2xx | `isError` with `MetraCardsApiError` message, `statusCode`, truncated `body` |
| S3 PUT non-2xx | `isError` with status |
| TTS response missing audio | `isError` |
| Zod input invalid | MCP SDK schema rejection |
| Network failure | `MetraCardsApiError` from existing client `request` helper |

## Testing

- Unit tests on `MetraCardsApiClient` for flashcard methods: assert path, method, Bearer header, and JSON body (at least create + one read); assert `MetraCardsApiError` on non-2xx.
- Unit tests on media helper: mocked `createPresignedUrl` + `fetch` PUT; assert key shape and returned `{ key, size }`.
- Unit / orchestration test for generate-audio path: mock `/audio` payload then assert upload is invoked.
- Manual smoke: `auth_login` → `cards_create` (text) → `cards_generate_audio` and/or `cards_upload_media` → `cards_update` with keys → `cards_get` → `cards_delete`.

## Out of scope

- Batch create/delete (`/flashcards/batch`)
- List deleted (`/flashcards/deleted`)
- Deck-scoped card listing pagination UI (`GET /decks/{id}/cards`)
- Changes to `metracards_api` or `metracards-web`
- HTTP/SSE MCP transport
- CamelCase aliases in tool inputs
- Base64 file payloads in tool args (use local path instead)

## Success criteria

After `auth_login`, an agent can manage the user's flashcards end-to-end via the seven MCP tools against a reachable MetraCards API, including attaching media from a local file or generated TTS audio, with the same auth and payload shapes as the web app.
