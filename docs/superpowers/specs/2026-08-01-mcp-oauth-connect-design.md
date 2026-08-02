# MetraCards MCP — OAuth Connect (Phase 2) Design

**Date:** 2026-08-01  
**Status:** Implemented — ready for browser smoke test  
**Repo:** `metracards-mcp`  
**Depends on:** Phase 1 HTTP transport — [`2026-08-01-mcp-http-transport-design.md`](./2026-08-01-mcp-http-transport-design.md)

## Goal

Add an **OAuth 2.1 Authorization Server bridge** on the same HTTP process as Phase 1 so remote MCP clients (ChatGPT Connect, Claude, etc.) can obtain a token via browser login (Firebase Google/Apple) and call `/mcp` — **without** changing the tool catalog or schemas.

Phase 2 does **not** include hosting/TLS/domain deploy (that is Phase 3).

## Scope

| In | Out |
|----|-----|
| AS metadata + PRM `authorization_servers` | AWS / TLS / custom domain |
| `GET /authorize` + Firebase login UI | CIMD |
| `POST /token` (authorization_code + refresh_token) | Shared multi-instance store (Redis/Dynamo) |
| `POST /register` (DCR, public clients) | Tool/schema changes |
| PKCE S256 required | Wide-open CORS |
| Access token = Firebase ID token (reuse Phase 1 JWKS verifier) | npm publish / Store listing |

## Principle

- `/mcp` stays a **resource server** (Phase 1 `requireBearerAuth` + Firebase JWKS).
- This process also acts as a minimal **AS** that authenticates the human via Firebase and returns a Firebase ID token as `access_token`.
- Tools remain identical; stdio `auth_login` unchanged; HTTP `auth_login` still returns structured “use Connect / Bearer” error.

## Architecture

```
Client (ChatGPT Connect)
  │
  ├─ POST /mcp (no token) → 401 + resource_metadata
  ├─ GET  /.well-known/oauth-protected-resource[/mcp]
  ├─ GET  /.well-known/oauth-authorization-server
  ├─ POST /register          (DCR → client_id)
  ├─ GET  /authorize         (PKCE) → Firebase login → redirect ?code=
  ├─ POST /token             → { access_token: <Firebase ID token>, refresh_token?, … }
  └─ POST /mcp  Authorization: Bearer <Firebase ID token>
                    → Phase 1 verifier → BearerTokenProvider → createServer → tools
```

## Decisions

| Topic | Choice |
|-------|--------|
| AS location | Same Node/Express process as Phase 1 HTTP entry |
| Access token | Firebase ID token (JWT); `/mcp` verifier unchanged |
| Refresh | Optional `refresh_token` = Firebase refresh token; `grant_type=refresh_token` via Secure Token API |
| Login UX | Browser page on `/authorize` (Firebase web Google/Apple), same project as app/web |
| Client registration | DCR (`POST /register`), public clients, no client_secret |
| PKCE | Required, `S256` only |
| Code / client store | In-memory (single process); documented multi-instance limit |
| CIMD | Deferred |
| Hosting | Deferred (Phase 3) |
| Legacy SDK AS helpers | Prefer thin custom Express routes (+ reuse login-page patterns); evaluate `@modelcontextprotocol/server-legacy/auth` only if it reduces risk without locking bad APIs |

## Components

1. **`src/oauth/`** (new)
   - `metadata.ts` — build AS metadata + wire PRM `authorization_servers`
   - `dcr.ts` — `POST /register`
   - `authorize.ts` — `/authorize` + login callback / code issue
   - `token.ts` — `/token` (code + refresh)
   - `store.ts` — in-memory clients + authorization codes
   - `pkce.ts` — S256 verify
2. **Authorize login page** — reuse/adapt `src/auth/login-page.html` patterns for AS redirect (state = OAuth request), not stdio credential file write
3. **`src/http.ts`** — mount AS routes + `mcpAuthMetadataRouter` (or equivalent); set PRM `authorization_servers` to this issuer
4. **Config** — issuer URL / public base URL for metadata (can default from `METRACARDS_MCP_RESOURCE_URL` origin); no new secrets beyond existing `FIREBASE_*`

## Auth code lifecycle

1. Client hits `/authorize` with `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `response_type=code`.
2. Validate client + redirect_uri against DCR record.
3. Show Firebase login; on success, create one-time code (TTL ~2 min) storing: challenge, redirect_uri, client_id, uid, idToken, refreshToken, exp.
4. Redirect to `redirect_uri?code=&state=`.
5. `/token` with `grant_type=authorization_code` + `code_verifier`: verify PKCE, consume code, return:
   - `access_token`: Firebase ID token  
   - `token_type`: `Bearer`  
   - `expires_in`: seconds until ID token `exp`  
   - `refresh_token`: Firebase refresh token (when available)
6. `/token` with `grant_type=refresh_token`: exchange via Firebase Secure Token API; return new ID token (+ rotated refresh if Firebase returns one).

Do **not** persist AS session to `credentials.json` on the server (hosted-ready; no shared disk identity).

## DCR

- `POST /register` with public client metadata (`redirect_uris`, `token_endpoint_auth_method: none`, etc.).
- Issue `client_id`; store in memory.
- No authentication required to register a client application (standard for public MCP clients).
- User authentication remains only on `/authorize`.

## Compatibility with Phase 1

| Behavior | Phase 2 |
|----------|---------|
| Manual `Authorization: Bearer <Firebase ID token>` | Still works |
| stdio `auth_login` | Unchanged |
| HTTP `auth_login` tool | Still structured error pointing to Connect / Bearer |
| Tool names/schemas | Unchanged |

## Error handling

- Invalid/missing PKCE, unknown code, redirect mismatch → OAuth error responses (`invalid_grant`, `invalid_request`, …)
- Firebase login failure → authorize error page / redirect with `error=`
- `/mcp` auth failures → unchanged Phase 1 `401` + PRM

## Testing

- Unit: PKCE S256; code TTL and one-time use; DCR create + authorize reject bad redirect
- Unit: token refresh maps Secure Token API response
- Integration: authorize→token→`/mcp` health/tools with mock Firebase login callback
- Manual: Connect against localhost or tunnel when available

## Known limitations

- In-memory state lost on restart; not safe behind multi-instance LB without Phase 3 store
- Firebase authorized domains must include the authorize host when publicly deployed (Phase 3)
- ChatGPT Connect compatibility depends on correct DCR + metadata; validate with a real client in the test plan
- A consent screen that shows the registered client and redirect URI is deferred to Phase 3.
- `/register` rate limiting is deferred to Phase 3.

## Success criteria

1. PRM advertises `authorization_servers` for this AS.
2. AS metadata served at `/.well-known/oauth-authorization-server`.
3. DCR `POST /register` creates a public client.
4. Authorize → Firebase login → code → `/token` returns Firebase ID token.
5. That token authenticates `/mcp` with the same tools as Phase 1.
6. Refresh grant returns a new ID token.
7. README documents Connect vs manual Bearer vs stdio.
8. Unit tests cover PKCE, code TTL/one-time, and basic DCR.

## Phase 3 preview

HTTPS domain, durable OAuth store, production Firebase authorized domains, optional CIMD, npm/Store listing.
