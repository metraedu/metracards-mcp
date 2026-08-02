# MetraCards MCP HTTP Transport (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Phase 1 implementation complete in working tree (2026-08-01). Smoke HTTP real done except `cards_generate_audio`. Commit/PR pending. Names evolved: `RefreshingTokenProvider` / `BearerTokenProvider`; HTTP via Express; tools split per file; `createServer(options)` required.

**Goal:** Ship Streamable HTTP at `/mcp` with Firebase ID token Bearer auth, shared tool catalog with stdio, and `cards_upload_media` accepting `content_base64` XOR `file_path`.

**Architecture:** One `createServer({ store, tokenProvider, client })` factory. stdio uses `RefreshingTokenProvider` + disk store; HTTP verifies JWT then builds a per-request `BearerTokenProvider`. Tools talk only to `TokenProvider` — no transport branching.

**Tech Stack:** Node 20+, TypeScript, `@modelcontextprotocol/server` + `@modelcontextprotocol/express` + `@modelcontextprotocol/node`, `jose` for Firebase JWKS, Express, existing zod/dotenv.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-mcp-http-transport-design.md`
- Tool names + schemas identical on stdio and HTTP
- No `if (http)` inside deck/card/health/media tool handlers
- Uid/token only via `TokenProvider.getUid()` / `getIdToken()`
- Exactly one of `file_path` | `content_base64` for `cards_upload_media`
- Phase 1: Firebase ID token Bearer only (no OAuth AS)
- Tests: `npm test` → `node --experimental-strip-types --test src/**/*.test.ts`
- Skip git commit steps unless the user asked to commit
- Out of scope: OAuth 2.1, hosting/TLS, CORS, `source_url`, npm publish

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/auth/token-provider.ts` | `TokenProvider` interface + `CredentialTokenProvider` + `getUid` |
| `src/auth/passthrough-token-provider.ts` | Request-scoped HTTP token provider |
| `src/auth/firebase-jwt.ts` | Verify Firebase ID token via JWKS |
| `src/config/index.ts` | HTTP bind/resource/hosts + max media bytes |
| `src/server/create-server.ts` | Inject `tokenProvider` (+ optional store for local auth tools) |
| `src/tools/auth.ts` | `auth_status` via provider; login/logout guard when no local session |
| `src/tools/cards.ts` | Uid from provider; `content_base64` XOR `file_path` |
| `src/media/upload.ts` | `decodeContentBase64` + size guard helper |
| `src/http.ts` | Streamable HTTP entry: PRM + Bearer + `/mcp` |
| `src/index.ts` | stdio entry via same `createServer` |
| `.env.example` / `README.md` / `package.json` | Config + deps + docs |

---

### Task 1: TokenProvider contract + CredentialTokenProvider.getUid

**Files:**
- Modify: `src/auth/token-provider.ts`
- Modify: `src/auth/token-provider.test.ts`
- Create: `src/auth/passthrough-token-provider.ts`
- Create: `src/auth/passthrough-token-provider.test.ts`

**Interfaces:**
- Produces:
  - `TokenProfile` `{ uid, email, displayName, provider?, updatedAt? }`
  - `TokenProvider` `{ canPersistCredentials, getIdToken(), getUid(), getProfile(), clearCache(), seedCache?(...) }`
  - `CredentialTokenProvider` (rename of current `TokenProvider` class)
  - `PassthroughTokenProvider({ uid, idToken })`

- [ ] **Step 1: Write failing passthrough + getUid tests**

```ts
// passthrough-token-provider.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassthroughTokenProvider } from './passthrough-token-provider.ts';

describe('PassthroughTokenProvider', () => {
  it('returns the request token and uid', async () => {
    const p = new PassthroughTokenProvider({ uid: 'u1', idToken: 'tok' });
    assert.equal(p.canPersistCredentials, false);
    assert.equal(await p.getIdToken(), 'tok');
    assert.equal(await p.getUid(), 'u1');
    assert.deepEqual(await p.getProfile(), {
      uid: 'u1',
      email: null,
      displayName: null,
    });
  });
});
```

Extend `token-provider.test.ts`:

```ts
it('getUid returns stored uid', async () => {
  // save creds with uid-1, then assert await provider.getUid() === 'uid-1'
});
```

- [ ] **Step 2: Implement interface + CredentialTokenProvider + PassthroughTokenProvider**

Export `TokenProvider` as the interface. Rename class to `CredentialTokenProvider` with `canPersistCredentials = true`, `getUid()` from store, `getProfile()` wrapping former `getStoredProfile`. Keep `seedCache` / `clearCache`.

`PassthroughTokenProvider`: `canPersistCredentials = false`; `getIdToken`/`getUid` return constructor values; `clearCache`/`seedCache` are no-ops.

- [ ] **Step 3: Run tests**

Run: `npm test -- src/auth/passthrough-token-provider.test.ts src/auth/token-provider.test.ts`  
Expected: PASS

---

### Task 2: Firebase JWT verifier

**Files:**
- Create: `src/auth/firebase-jwt.ts`
- Create: `src/auth/firebase-jwt.test.ts`
- Modify: `package.json` (add `jose`)

**Interfaces:**
- Produces: `verifyFirebaseIdToken(token, projectId, options?): Promise<{ uid, idToken, exp }>`
- Throws on invalid/expired/wrong aud/iss

- [ ] **Step 1: Install jose**

Run: `npm install jose`

- [ ] **Step 2: Write tests with mocked JWKS verify**

Inject a `verify` function dependency for unit tests (happy path + missing sub + wrong claims mapped to errors). Do not hit the network in unit tests.

- [ ] **Step 3: Implement firebase-jwt.ts**

Use `createRemoteJWKSet` + `jwtVerify` against  
`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`  
with `issuer: https://securetoken.google.com/${projectId}`, `audience: projectId`. Return `{ uid: payload.sub, idToken: token, exp: payload.exp }`.

Map to MCP `AuthInfo` in HTTP layer: `{ token, clientId: uid, scopes: ['openid'], expiresAt: exp }`.

---

### Task 3: Config (HTTP + media cap)

**Files:**
- Modify: `src/config/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Extends `AppConfig` with:
  - `http: { host, port, resourceUrl, authServers: string[], allowedHosts: string[] }`
  - `maxMediaBytes: number` (default `10485760`)

Defaults from spec. `allowedHosts` from `METRACARDS_MCP_ALLOWED_HOSTS` CSV or hostname of `resourceUrl`.

---

### Task 4: createServer injection + auth tools

**Files:**
- Modify: `src/server/create-server.ts`
- Modify: `src/tools/auth.ts`
- Modify: `src/index.ts` (if needed)
- Modify: any imports of `TokenProvider` class → `CredentialTokenProvider`

**Interfaces:**
- `createServer(options?: { client?: MetraCardsApiClient; tokenProvider?: TokenProvider; store?: CredentialStore })`
- Default (stdio): build store + `CredentialTokenProvider`
- HTTP: pass `PassthroughTokenProvider` (no writable store, or a no-op store unused for login)

- [ ] **Step 1: Refactor createServer** to accept injected `tokenProvider`; only construct store/credential provider when omitted.

- [ ] **Step 2: Auth tools**
  - `auth_status`: use `tokenProvider.getProfile()` → `{ authenticated: true, uid, ... }` or `{ authenticated: false }`
  - `auth_login` / `auth_logout`: if `!tokenProvider.canPersistCredentials`, return structured error (schema unchanged); else existing behavior with store

---

### Task 5: Media base64 + cards uid via TokenProvider

**Files:**
- Modify: `src/media/upload.ts`
- Modify: `src/media/upload.test.ts`
- Modify: `src/tools/cards.ts`

**Interfaces:**
- `decodeContentBase64(value: string): Buffer` (strip `data:*;base64,`)
- `assertMediaSize(buffer, maxBytes)` throws `MediaUploadError`
- `CardsToolDeps = { tokenProvider: TokenProvider; maxMediaBytes: number }`
- `cards_upload_media` input: exactly one of `file_path` | `content_base64`; optional `content_type`, `file_extension`

- [ ] **Step 1: Tests for decode + XOR + oversize + uid from provider**

- [ ] **Step 2: Implement upload helpers + cards tool updates**
  - Replace `deps.store.load()` with `await deps.tokenProvider.getUid()`
  - Same for `cards_generate_audio`

---

### Task 6: HTTP entrypoint

**Files:**
- Modify: `src/http.ts`
- Modify: `package.json` (add `@modelcontextprotocol/node`, peer `hono` if required)

**Interfaces:**
- Boot fails fast if `FIREBASE_PROJECT_ID` missing
- Routes:
  - `GET /.well-known/oauth-protected-resource` (+ `/mcp` path variant) → PRM JSON (`resource`, optional `authorization_servers`)
  - `/mcp` → verify Bearer → `toNodeHandler(createMcpHandler(({ authInfo }) => createServer({ tokenProvider: new PassthroughTokenProvider(...) })))`
- Host allowlist via `hostHeaderValidation`
- No broad CORS
- SIGINT/SIGTERM → `handler.close()` then exit
- `npm run start:http` runs this entry

Bearer wiring (plain `node:http`):

```ts
import {
  createMcpHandler,
  verifyBearerToken,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
} from '@modelcontextprotocol/server';
import { toNodeHandler, hostHeaderValidation } from '@modelcontextprotocol/node';

// On /mcp:
try {
  const authInfo = await verifyBearerToken(req.headers.authorization, {
    verifier: { verifyAccessToken },
    resourceMetadataUrl,
  });
  (req as { auth?: typeof authInfo }).auth = authInfo;
} catch (err) {
  const response = bearerAuthChallengeResponse(err, { resourceMetadataUrl });
  // write Response status/headers/body to res; return
}
await nodeHandler(req, res);
```

`verifyAccessToken` calls `verifyFirebaseIdToken` and returns AuthInfo with `expiresAt` set.

---

### Task 7: Docs + regression

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

- [ ] Document `start:http`, Bearer auth, PRM, media `content_base64`, env vars
- [ ] Run full `npm test` and `npm run build`

## Success criteria mapping

1. [x] `npm run start:http` → `/mcp` — Task 6 (+ Express)
2. [x] Unauthenticated → 401 + PRM — Task 6 (smoke)
3. [x] Same tools/schemas — Tasks 4–5 (single registration)
4. [~] Bearer can run health/decks/cards/media/audio — smoke: health/decks/cards/`cards_upload_media`; **`cards_generate_audio` pending smoke**
5. [~] stdio login + file_path + content_base64 — in code; **stdio smoke not re-run**
6. [x] No transport branch in tools; uid via TokenProvider — Tasks 1, 4, 5
7. [x] README — Task 7
