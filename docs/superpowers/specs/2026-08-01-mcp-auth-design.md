# MetraCards MCP — Auth Design

**Date:** 2026-08-01  
**Status:** Approved  
**Repo:** `metracards-mcp`  
**Depends on:** `2026-08-01-mcp-boilerplate-design.md`

## Goal

Add personal local authentication to the MCP server so tools can call authenticated `metracards_api` endpoints with the same contract as `metracards-web`: Firebase ID tokens via `Authorization: Bearer <token>`, plus automatic `POST /users` upsert after login.

## Decisions

| Topic | Choice |
|-------|--------|
| Primary scenario | Personal local use (stdio / Cursor), acting as the logged-in user |
| Login UX | Interactive browser login on demand |
| Providers (v1) | Google and Apple (parity with web) |
| Credential persistence | Refresh token in local file (`0600`) |
| Post-login API | Automatic `POST /users` (same body as web `upsertUser`) |
| Auth surface | MCP tools: `auth_login`, `auth_logout`, `auth_status` |
| Health | Remains unauthenticated (`health_check`) |
| Multi-user HTTP OAuth | Out of scope for v1 |

## Architecture

```
Agent / Cursor
      │ stdio
      ▼
┌─────────────────────────────────────┐
│  MCP server                         │
│  auth_login / auth_logout / status  │
│  health_check (+ future tools)      │
└───────┬─────────────────┬───────────┘
        │                 │
        ▼                 ▼
┌───────────────┐   ┌─────────────────────┐
│ Browser login │   │ Token provider      │
│ 127.0.0.1     │   │ refresh → idToken   │
│ Firebase Web  │   └──────────┬──────────┘
└───────┬───────┘              │
        │ refreshToken         ▼
        ▼              ┌─────────────────────┐
┌───────────────┐      │ MetraCardsApiClient │
│ Credential    │─────▶│ Bearer on protected │
│ store (file)  │      │ POST /users upsert  │
└───────────────┘      └──────────┬──────────┘
                                  ▼
                           metracards_api
```

### Components

1. **`src/auth/credential-store`** — Read/write credentials JSON; enforce `0600`; path from config.
2. **`src/auth/token-provider`** — Load refresh token; cache ID token in memory; refresh via Firebase Secure Token API before expiry; clear on logout / hard 401.
3. **`src/auth/browser-login`** — Ephemeral `127.0.0.1` HTTP server + embedded login page (Firebase Web SDK); Google/Apple popups; one-time CSRF state; timeout (~2 min).
4. **`src/tools/auth-*`** — Register `auth_login`, `auth_logout`, `auth_status`.
5. **`src/clients/metracards-api`** — Inject token provider; attach Bearer on authenticated methods; add `upsertUser({ display_name, photo_url })`.
6. **`src/config`** — Extend with Firebase web config env vars + optional credentials path override.

## Login and data flow

1. Agent calls `auth_login` (optional `provider: "google" | "apple"`; default `"google"`).
2. MCP starts `http://127.0.0.1:<ephemeral-port>` serving the login page.
3. OS browser opens; user signs in with Google or Apple (Firebase project from `FIREBASE_PROJECT_ID`, same as web).
4. Page POSTs to local callback: `idToken`, `refreshToken`, `uid`, `email`, `displayName`, `photoURL`, `provider`, plus CSRF `state`.
5. MCP validates state, stores refresh token + non-sensitive profile fields, shuts down the local server.
6. MCP calls `POST /users` with `Authorization: Bearer <idToken>` and body `{ display_name, photo_url }` (nulls allowed, matching web).
7. Tool result returns session summary only (uid, email, provider, upsert ok/fail) — **never tokens**.
8. Subsequent authenticated API calls obtain a fresh ID token from the token provider and send `Authorization: Bearer …`.

`auth_status` reports whether credentials exist and basic profile fields.  
`auth_logout` deletes the credentials file and clears in-memory token cache.

## Upstream auth contract (parity with web/API)

```http
Authorization: Bearer <Firebase ID token>
```

- Token: Firebase Auth ID JWT (RS256), project `metracards-e4003`.
- API verifies via JWKS; identity = `user_id` / `sub`.
- Upsert: `POST /users` with JSON `{ "display_name": string | null, "photo_url": string | null }`.
- Refresh: `POST https://securetoken.googleapis.com/v1/token?key=<FIREBASE_API_KEY>` with `grant_type=refresh_token` and `refresh_token`.

## Credential store

- **Default path:** `~/.config/metracards-mcp/credentials.json`
- **Override:** `METRACARDS_MCP_CREDENTIALS_PATH`
- **File mode:** `0600`
- **Fields:** `refreshToken`, `uid`, `email`, `displayName`, `photoURL`, `provider`, `updatedAt`
- Never log tokens; never return tokens from MCP tools.

## Config (env)

| Variable | Purpose |
|----------|---------|
| `METRACARDS_API_URL` | API base (existing) |
| `FIREBASE_API_KEY` | Web API key (refresh + login page) |
| `FIREBASE_AUTH_DOMAIN` | Auth domain |
| `FIREBASE_PROJECT_ID` | Project id |
| `FIREBASE_STORAGE_BUCKET` | Firebase config (login page) |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase config (login page) |
| `FIREBASE_APP_ID` | Firebase config (login page) |
| `METRACARDS_MCP_CREDENTIALS_PATH` | Optional credentials file override |

Same Firebase values as `metracards-web` (`VITE_FIREBASE_*` without the `VITE_` prefix).

## Error handling

| Case | Behavior |
|------|----------|
| Not logged in / missing credentials | Authenticated tool returns actionable MCP error: call `auth_login` |
| Login cancelled / timeout | `auth_login` fails with clear message |
| Upsert fails after successful Firebase login | Credentials kept; `auth_login` reports partial success (authenticated, upsert failed) + retry hint |
| API 401 | Invalidate ID token cache; retry refresh once; if still unauthorized, ask for `auth_login` |
| Invalid refresh token | Clear credentials; require re-login |

## Testing

- Unit: credential store (read/write/permissions path), token provider refresh/cache, API client Bearer header + upsert payload, auth tool error mapping.
- Browser login: mocked HTTP callback / doubles — no real browser in CI.
- Manual smoke: `auth_login` → browser → `auth_status` → authenticated API call against local or remote API.

## Out of scope

- HTTP/SSE MCP transport and multi-user OAuth (MCP OAuth 2.1)
- OS keychain / encrypted credential vault beyond file `0600`
- Email/password Firebase auth
- Domain tools (decks, flashcards, etc.) beyond enabling their future auth use
- Changing `metracards_api` or `metracards-web` auth

## Success criteria

A local developer can run the MCP in Cursor, call `auth_login`, complete Google or Apple in the browser, see `auth_status` authenticated, have the user upserted via `POST /users`, and invoke authenticated API methods with the same Bearer contract as the web app.
