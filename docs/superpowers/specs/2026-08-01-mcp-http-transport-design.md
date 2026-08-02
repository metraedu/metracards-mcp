# MetraCards MCP — HTTP Transport (Phase 1) Design

**Date:** 2026-08-01  
**Status:** Implemented (Phase 1 code + smoke) — not committed; Phase 2 / hosting still open  
**Repo:** `metracards-mcp`

## Progress / Pronto (2026-08-01)

| Área | Estado |
|------|--------|
| Design + implementation plan | Feito |
| HTTP Streamable (`npm run start:http`, Express) | Feito |
| Bearer Firebase ID token (JWKS) + PRM `401` | Feito + smoke real |
| `TokenProvider` (`RefreshingTokenProvider` / `BearerTokenProvider`) | Feito |
| Tools iguais stdio/HTTP; uid só via `TokenProvider` | Feito |
| `cards_upload_media` com `content_base64` XOR `file_path` | Feito + smoke HTTP (`content_base64`) |
| README / `.env.example` | Feito |
| Unit tests + `tsc` | Feito |
| Smoke HTTP com token Firebase real | Feito: `health_check`, `auth_status`, `decks_list`, `cards_list`, `cards_create`, `cards_upload_media`; `auth_login` no HTTP retorna erro estruturado |
| Smoke `cards_generate_audio` via HTTP | **Não exercitado** nesta rodada |
| Smoke regressão stdio (`auth_login` + `file_path`) | **Não re-exercitado** nesta rodada (código mantido) |
| Commit / PR | **Pendente** |
| Phase 2 OAuth Connect / hosting / npm / Store | **Fora do Phase 1** (ainda não iniciado) |

## Goal

Ship a **hosted-ready Streamable HTTP** entrypoint for `metracards-mcp` so remote clients (ChatGPT, Claude, etc.) can use the **same tool catalog and schemas** as stdio — including **media upload via `content_base64`**. Phase 1 authenticates HTTP with a **Firebase ID token** as Bearer. Full MCP OAuth 2.1 authorize/token bridge is Phase 2.

## Principle: one MCP, two transports

stdio and HTTP must stay **canonical**:

| Layer | Parity rule |
|-------|-------------|
| Tool names + input/output schemas | **Identical** on both transports |
| Domain behavior (decks, cards, health, media, TTS) | **Identical** — no `if (http)` in tool handlers |
| How the process obtains a Firebase ID token | **Only** difference (entrypoints + `TokenProvider` impl) |
| `createServer(...)` | **One** factory; both entrypoints call it |

Entrypoints (`src/index.ts` / `src/http.ts`) wire transport + auth source. Tools talk only to `TokenProvider` + API client.

## Context

- Product target: **hosted** MetraCards MCP (not only local `npx`/stdio).
- Identity: **Firebase Auth** (same project as app/web).
- Approach: **phased** — HTTP + Bearer validation now; OAuth AS bridge later.
- stdio keeps local `auth_login` (browser on `127.0.0.1`) for Cursor/Claude Desktop.

## Decisions

| Topic | Choice |
|-------|--------|
| Transport | Streamable HTTP via SDK v2 `createMcpExpressApp` + `requireBearerAuth` + `toNodeHandler(createMcpHandler)` |
| Tool surface | Single shared registration; no HTTP-only or stdio-only tools |
| Auth (HTTP gate) | Validate Firebase ID token JWT (JWKS); pass into factory as `BearerTokenProvider` |
| Auth (stdio) | Existing `CredentialStore` + `RefreshingTokenProvider` |
| Auth (Phase 2) | OAuth 2.1 bridge — out of Phase 1 |
| Server factory | HTTP: fresh `McpServer` per request; stdio: long-lived process (SDK stdio) — both via same `createServer` |
| Media upload | Same tool on both: exactly one of `file_path` \| `content_base64`; MCP does presign + PUT S3 |
| Uid for S3 keys | From `TokenProvider` profile/uid API on **both** transports (stop reading `CredentialStore` inside card tools) |
| Deploy / npm / Store | Out of Phase 1 (document reverse-proxy HTTPS only) |

## Architecture

```
                 ┌─ stdio (index.ts) ──► CredentialStore + RefreshingTokenProvider
Client ──────────┤
                 └─ HTTP (http.ts) ───► JWT verify ──► BearerTokenProvider
                                      │
                                      ▼
                         createServer({ tokenProvider, … })
                         identical tools → MetraCards API / S3
```

## Components

1. **`src/http.ts`** — Express via `createMcpExpressApp`; PRM route; `requireBearerAuth`; `toNodeHandler` + `createMcpHandler(() => createServer(...))`.
2. **`src/index.ts`** — Unchanged role: stdio + store-backed `TokenProvider` via `createServer`.
3. **`src/auth/firebase-jwt.ts`** — Verify Firebase ID tokens via JWKS; `{ uid, idToken }`.
4. **`TokenProvider` contract** — Shared interface used by tools:
   - `getIdToken(): Promise<string>`
   - `getUid(): Promise<string>` (or profile that includes uid)
   - stdio impl: refresh from disk; HTTP impl: return request token / uid
5. **`BearerTokenProvider`** — HTTP/request-scoped; no disk.
6. **`createServer`** — Inject `tokenProvider` (+ store only for `auth_login` / `auth_logout` / local status). **No `authMode` branching inside deck/card/health/media tools.**
7. **PRM** — `/.well-known/oauth-protected-resource`.
8. **Config** — HTTP bind/resource/hosts + `METRACARDS_MCP_MAX_MEDIA_BYTES`.
9. **`cards_upload_media`** — Extend schema; both transports; reuse `uploadMediaBuffer`.

## Auth: what differs vs what does not

### Identical (tools)

| Tool | Behavior (both transports) |
|------|----------------------------|
| `auth_status` | Report whether a uid/token is available via `TokenProvider` |
| `health_check`, decks, cards, media, TTS | Same schemas and code paths |

### Differs only at the edge

| Concern | stdio | HTTP |
|---------|-------|------|
| Establishing credentials | `auth_login` opens local browser → writes `credentials.json` | Client sends `Authorization: Bearer <Firebase ID token>` (Phase 1; OAuth Connect in Phase 2) |
| `auth_login` | Works as today | Same tool registered; if there is no writable local session (passthrough provider), returns a structured error explaining that HTTP already authenticates via Bearer / use Phase 2 Connect later — **schema unchanged** |
| `auth_logout` | Clears credential file + cache | Same tool; clears nothing meaningful on passthrough → structured no-op/error, **schema unchanged** |
| Unauthenticated `/mcp` | N/A (process local) | HTTP `401` + PRM `WWW-Authenticate` |

### HTTP gate (Phase 1)

1. No `Authorization` → `401` + `resource_metadata` PRM pointer.
2. Verify JWT (`iss`, `aud` = `FIREBASE_PROJECT_ID`, `exp`) via securetoken JWKS.
3. Pass `authInfo` (uid + raw id token) into factory → `BearerTokenProvider`.
4. Invalid token → `401`.
5. All `/mcp` calls require valid Bearer in Phase 1 (including invoking `health_check`).

## Media upload (both transports)

API stays **presign + PUT S3** (same as metracards-web). MCP holds the bytes.

```
Client (stdio or HTTP)
  │  cards_upload_media
  │  { flashcard_id, side, kind, file_path? | content_base64? , … }
  ▼
metracards-mcp (same tool code)
  1. Resolve bytes from file_path XOR content_base64
  2. Enforce max decoded size for base64
  3. uid ← tokenProvider.getUid()
  4. POST /s3/presigned-url → PUT S3 → update flashcard
```

### Input (canonical schema)

| Field | Required | Notes |
|-------|----------|-------|
| `flashcard_id` | yes | UUID |
| `side` | yes | `front` \| `back` |
| `kind` | yes | `audio` \| `image` |
| `file_path` | one of | Absolute path on the **MCP host** filesystem |
| `content_base64` | one of | Raw base64; strip `data:*;base64,` prefix if present |
| `content_type` | optional | With base64; else guess from kind/extension |
| `file_extension` | optional | For S3 key when using base64 |

Exactly one of `file_path` / `content_base64`. Both allowed on **stdio and HTTP** (remote clients use base64; local agents may use either).

| Knob | Default | Purpose |
|------|---------|---------|
| `METRACARDS_MCP_MAX_MEDIA_BYTES` | `10485760` (10 MiB) | Max **decoded** `content_base64` |

`cards_generate_audio` already buffer-uploads — same on both transports.

## Config

| Variable | Default | Purpose |
|----------|---------|---------|
| `METRACARDS_MCP_HTTP_HOST` | `0.0.0.0` | Bind address |
| `METRACARDS_MCP_HTTP_PORT` | `3000` | Port |
| `METRACARDS_MCP_RESOURCE_URL` | `http://127.0.0.1:3000/mcp` | Canonical `resource` in PRM |
| `METRACARDS_MCP_AUTH_SERVERS` | empty / optional CSV | PRM `authorization_servers` (Phase 2 placeholder) |
| `METRACARDS_MCP_ALLOWED_HOSTS` | derived from resource URL host | `Host` allowlist |
| `METRACARDS_MCP_MAX_MEDIA_BYTES` | `10485760` | Max decoded base64 media |
| Existing `FIREBASE_*` / `METRACARDS_API_URL` | unchanged | JWT audience + API |

Update `.env.example` and README. Production behind HTTPS reverse proxy.

## HTTP mount details

- Add `@modelcontextprotocol/express`, `express`, `@modelcontextprotocol/node`.
- `createMcpExpressApp({ host, allowedHosts })` + `requireBearerAuth` + `toNodeHandler(createMcpHandler(...))` for `/mcp`.
- Host allowlist (not localhost-only when binding `0.0.0.0`).
- No broad CORS in Phase 1 (`createMcpExpressApp` defaults; do not open CORS).
- `SIGINT`/`SIGTERM` → `handler.close()` then exit.
- `npm run start:http` runs the real entry.

## Error handling

- Missing/invalid Bearer: HTTP `401` + PRM pointer.
- Tool errors (media validation, API): same JSON error shape on both transports.
- Missing `FIREBASE_PROJECT_ID` on HTTP boot: fail fast.

## Testing

- Unit: JWT verifier; passthrough `TokenProvider` (`getIdToken` / `getUid`).
- Unit: media — `content_base64`, `file_path`, reject both/neither, oversize.
- Unit: card tools resolve uid via `TokenProvider` (mock), not store.
- Integration: HTTP `401` without Bearer; with mock Bearer factory gets authInfo.
- Regression: existing stdio auth + client tests.

## Known limitations (Phase 1)

- Firebase ID token for HTTP is out-of-band until Phase 2 OAuth Connect.
- MCP/client message size may bind before the 10 MiB server cap; `source_url` deferred.
- Flutter sync vs presign+S3 is outside this MCP change.
- `file_path` only works if the file exists on the MCP host (true for local stdio; usually false for hosted HTTP — use `content_base64`).

## Out of scope (Phase 1)

- OAuth 2.1 `/authorize`, `/token`, PKCE, DCR/CIMD
- Hosting (AWS, TLS, domain), npm publish, Store listing
- Wide-open CORS
- `source_url` media fetch
- Changing MetraCards API to accept multipart/base64 (API stays presign-only)
- Divergent HTTP-only tool schemas

## Phase 2 preview

→ Spec: [`2026-08-01-mcp-oauth-connect-design.md`](./2026-08-01-mcp-oauth-connect-design.md)  
AS metadata + authorize/token + DCR + Firebase browser login; access token = Firebase ID token; ChatGPT Connect. Tool surface unchanged. Hosting = Phase 3.

## Success criteria

1. [x] `npm run start:http` serves Streamable HTTP at `/mcp`.
2. [x] Unauthenticated `/mcp` → `401` + PRM hint.
3. [x] Same tool list/schemas on stdio and HTTP.
4. [~] Authenticated HTTP Bearer can run health, decks, cards, `cards_upload_media` (`content_base64`), and `cards_generate_audio`.  
   → Validado em smoke: health, decks, cards CRUD/list, `cards_upload_media`. **`cards_generate_audio` ainda sem smoke HTTP.**
5. [~] stdio still supports `auth_login` + `file_path` and also accepts `content_base64`.  
   → Schema/`RefreshingTokenProvider` no código; **stdio não re-smokeado nesta rodada.**
6. [x] Deck/card/media tools do not branch on transport; uid/token only via `TokenProvider`.
7. [x] README documents both entrypoints, Bearer, and canonical media inputs.

**Phase 1 “pronto para commit”:** critérios 1–3, 6–7 fechados; 4–5 fechados no código com lacuna só de smoke (`generate_audio` HTTP + regressão stdio).  
**Não pronto para “hosted / Connect”:** Phase 2 + deploy.
