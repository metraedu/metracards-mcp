# MetraCards MCP OAuth Connect (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth 2.1 AS bridge (DCR, authorize + Firebase login, token + refresh) on the Phase 1 HTTP process so Connect clients receive a Firebase ID token usable on `/mcp`.

**Architecture:** Same Express app as Phase 1. New `src/oauth/*` owns in-memory client/code store, PKCE, DCR, authorize UI callback, and token endpoint. `/mcp` verifier stays Firebase JWKS; `access_token` is the Firebase ID token.

**Tech Stack:** Node 20+, TypeScript, Express, existing Firebase web login page patterns, Secure Token REST for refresh, `@modelcontextprotocol/express` metadata helpers where useful.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-mcp-oauth-connect-design.md`
- Depends on Phase 1 HTTP (`src/http.ts`, `verifyFirebaseIdToken`, `BearerTokenProvider`)
- Tool names/schemas unchanged
- Access token = Firebase ID token; do not invent opaque MCP tokens
- PKCE S256 required; public DCR clients only
- In-memory store only (document multi-instance limit)
- No hosting/TLS/CIMD/shared Redis
- Tests: `npm test` → `node --experimental-strip-types --test src/**/*.test.ts`
- Prefer `import type` for type-only imports so strip-types tests resolve
- Skip git commit steps unless the user asked to commit

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/config/index.ts` | Add `http.issuerUrl` (origin for AS metadata; default from resource URL origin) |
| `src/oauth/pkce.ts` | `verifyS256(codeVerifier, codeChallenge): boolean` |
| `src/oauth/store.ts` | In-memory `OAuthStore`: clients + auth codes (TTL, one-time) |
| `src/oauth/metadata.ts` | Build AS metadata + PRM document with `authorization_servers` |
| `src/oauth/dcr.ts` | Express `POST /register` handler factory |
| `src/oauth/authorize.ts` | `GET /authorize`, login page, `POST` callback → redirect with code |
| `src/oauth/token.ts` | `POST /token` (authorization_code + refresh_token) |
| `src/oauth/firebase-refresh.ts` | Shared Secure Token refresh helper (or reuse logic from `RefreshingTokenProvider`) |
| `src/auth/oauth-login-page.html` | Authorize-flow login page (POST tokens to AS callback, not stdio) |
| `src/http.ts` | Mount OAuth routes + updated PRM/AS metadata |
| `README.md` / `.env.example` | Document Connect vs Bearer vs stdio; `METRACARDS_MCP_ISSUER_URL` optional |

---

### Task 1: Config issuer URL

**Files:**
- Modify: `src/config/index.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `config.http.issuerUrl: string` — origin only, e.g. `http://127.0.0.1:3000`  
  Default: `new URL(resourceUrl).origin`  
  Override: `METRACARDS_MCP_ISSUER_URL`

- [ ] **Step 1: Extend `HttpConfig`**

```ts
export type HttpConfig = {
  host: string;
  port: number;
  resourceUrl: string;
  issuerUrl: string;
  authServers: string[];
  allowedHosts: string[];
};
```

In `readHttpConfig()`, after parsing `resourceUrl`:

```ts
const issuerUrl =
  process.env.METRACARDS_MCP_ISSUER_URL?.trim() ||
  new URL(resourceUrl).origin;
```

If `METRACARDS_MCP_AUTH_SERVERS` is empty, default `authServers` to `[issuerUrl]` (Phase 2 AS is this process).

- [ ] **Step 2: Document in `.env.example`**

```bash
# METRACARDS_MCP_ISSUER_URL=http://127.0.0.1:3000
```

- [ ] **Step 3: `npm run build`**

Expected: PASS

---

### Task 2: PKCE + in-memory store

**Files:**
- Create: `src/oauth/pkce.ts`
- Create: `src/oauth/pkce.test.ts`
- Create: `src/oauth/store.ts`
- Create: `src/oauth/store.test.ts`

**Interfaces:**
- Produces:
  - `verifyS256(codeVerifier: string, codeChallenge: string): boolean`
  - `createOAuthStore(options?: { codeTtlMs?: number; now?: () => number })`
  - `OAuthStore` methods:
    - `saveClient(client: RegisteredClient): void`
    - `getClient(clientId: string): RegisteredClient | undefined`
    - `saveAuthCode(code: string, record: AuthCodeRecord): void`
    - `consumeAuthCode(code: string): AuthCodeRecord | undefined` (deletes; returns undefined if missing/expired)

```ts
export type RegisteredClient = {
  clientId: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none';
  createdAt: string;
};

export type AuthCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  uid: string;
  idToken: string;
  refreshToken: string | null;
  idTokenExpiresAtSec: number;
  expiresAtMs: number;
};
```

- [ ] **Step 1: Failing PKCE test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { verifyS256 } from './pkce.ts';

function challengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('verifyS256', () => {
  it('accepts matching verifier', () => {
    const verifier = randomBytes(32).toString('base64url');
    assert.equal(verifyS256(verifier, challengeS256(verifier)), true);
  });
  it('rejects mismatch', () => {
    assert.equal(verifyS256('a', challengeS256('b')), false);
  });
});
```

- [ ] **Step 2: Implement `pkce.ts`**

```ts
import { createHash } from 'node:crypto';

export function verifyS256(codeVerifier: string, codeChallenge: string): boolean {
  const computed = createHash('sha256').update(codeVerifier).digest('base64url');
  return computed === codeChallenge;
}
```

- [ ] **Step 3: Store tests** — save/get client; save code; consume once; expired returns undefined

- [ ] **Step 4: Implement `store.ts`** with `codeTtlMs` default `120_000`

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: PASS for new oauth tests

---

### Task 3: Metadata builders

**Files:**
- Create: `src/oauth/metadata.ts`
- Create: `src/oauth/metadata.test.ts`

**Interfaces:**
- Consumes: `issuerUrl`, `resourceUrl`
- Produces:
  - `buildAuthorizationServerMetadata(issuerUrl: string): OAuthMetadata-like object`
  - `buildProtectedResourceMetadata(resourceUrl: string, authorizationServers: string[]): object`

AS metadata must include at least:
- `issuer`
- `authorization_endpoint`: `${issuer}/authorize`
- `token_endpoint`: `${issuer}/token`
- `registration_endpoint`: `${issuer}/register`
- `response_types_supported`: `['code']`
- `grant_types_supported`: `['authorization_code', 'refresh_token']`
- `code_challenge_methods_supported`: `['S256']`
- `token_endpoint_auth_methods_supported`: `['none']`

PRM:
- `resource`: resourceUrl
- `authorization_servers`: authorizationServers
- `bearer_methods_supported`: `['header']`

- [ ] **Step 1: Unit test shapes**
- [ ] **Step 2: Implement**
- [ ] **Step 3: `npm test`**

---

### Task 4: DCR `POST /register`

**Files:**
- Create: `src/oauth/dcr.ts`
- Create: `src/oauth/dcr.test.ts`

**Interfaces:**
- Consumes: `OAuthStore`
- Produces: `createDcrRouter(store: OAuthStore): express.Router` mounting `POST /register`

Request JSON (minimal):
```json
{
  "redirect_uris": ["http://127.0.0.1:54321/callback"],
  "token_endpoint_auth_method": "none",
  "client_name": "test"
}
```

Response `201`:
```json
{
  "client_id": "<uuid>",
  "redirect_uris": ["..."],
  "token_endpoint_auth_method": "none"
}
```

Reject empty `redirect_uris` with `400` + OAuth error JSON.

- [ ] **Step 1: Test register + persist in store**
- [ ] **Step 2: Implement**
- [ ] **Step 3: `npm test`**

---

### Task 5: Token endpoint (code + refresh)

**Files:**
- Create: `src/oauth/firebase-refresh.ts` (extract refresh HTTP call; inject `fetch`)
- Create: `src/oauth/token.ts`
- Create: `src/oauth/token.test.ts`

**Interfaces:**
- `refreshFirebaseIdToken(apiKey, refreshToken, fetchImpl?): Promise<{ idToken, refreshToken, expiresInSec }>`
- `createTokenHandler(deps: { store: OAuthStore; firebaseApiKey: string; fetchImpl?: typeof fetch }): RequestHandler`

`authorization_code` body (form or JSON — accept `application/x-www-form-urlencoded` primarily):
- `grant_type`, `code`, `redirect_uri`, `client_id`, `code_verifier`

Flow: load/consume code → verify client_id + redirect_uri → `verifyS256` → return tokens.

`refresh_token` grant: call `refreshFirebaseIdToken`; return new access_token + expires_in (+ refresh if rotated).

- [ ] **Step 1: Failing tests** for happy code exchange, bad PKCE → `invalid_grant`, refresh success with mock fetch
- [ ] **Step 2: Implement firebase-refresh + token handler**
- [ ] **Step 3: `npm test`**

---

### Task 6: Authorize + login page

**Files:**
- Create: `src/auth/oauth-login-page.html` (clone/adapt `login-page.html`; on success `POST /authorize/callback` with idToken/refreshToken/uid/state)
- Create: `src/oauth/authorize.ts`
- Create: `src/oauth/authorize.test.ts` (mock store + inject html; POST callback without real Firebase)

**Interfaces:**
- `createAuthorizeRouter(deps: { store; firebase: FirebaseConfig; loginPageHtml: string }): Router`
  - `GET /authorize` — validate query (`response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`); serve HTML with pending request id in `__STATE__`
  - Pending authorize requests also in store (or separate Map): map `loginState` → authorize params until callback
  - `POST /authorize/callback` — body JSON like stdio login payload; issue auth code; `302` to `redirect_uri?code=&state=`

Do not write `credentials.json`.

- [ ] **Step 1: Test invalid client/redirect → error**
- [ ] **Step 2: Test callback issues one-time code redeemable by token handler**
- [ ] **Step 3: Implement page + router**
- [ ] **Step 4: Copy HTML in `npm run build`** (`cp` alongside login-page.html)

Update `package.json` build script:

```json
"build": "tsc && mkdir -p dist/auth && cp src/auth/login-page.html src/auth/oauth-login-page.html dist/auth/"
```

---

### Task 7: Wire into `http.ts` + docs

**Files:**
- Modify: `src/http.ts`
- Modify: `README.md`
- Modify: `.env.example` (if anything left)
- Update: `docs/superpowers/specs/2026-08-01-mcp-oauth-connect-design.md` status → `Approved` / `Ready to implement` as appropriate

**Wiring sketch:**

```ts
const store = createOAuthStore();
const issuerUrl = config.http.issuerUrl;
const asMeta = buildAuthorizationServerMetadata(issuerUrl);
const prm = buildProtectedResourceMetadata(
  config.http.resourceUrl,
  config.http.authServers.length ? config.http.authServers : [issuerUrl],
);

app.get(['/.well-known/oauth-protected-resource', prmPath], (_req, res) => res.json(prm));
app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json(asMeta));
app.use(createDcrRouter(store)); // POST /register
app.use(createAuthorizeRouter({ store, firebase: config.firebase!, loginPageHtml }));
app.post('/token', createTokenHandler({ store, firebaseApiKey: config.firebase!.apiKey }));
// existing /mcp + requireBearerAuth unchanged
```

Fail fast on HTTP boot if Firebase config missing (needed for authorize), same spirit as `FIREBASE_PROJECT_ID` check.

- [ ] **Step 1: Mount routes**
- [ ] **Step 2: README section “OAuth Connect (Phase 2)”** — DCR → authorize → token → Bearer; contrast stdio and manual Bearer
- [ ] **Step 3: `npm run build && npm test`**
- [ ] **Step 4: Manual smoke (local)**

```bash
# register
curl -sS -X POST http://127.0.0.1:3000/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["http://127.0.0.1:9999/cb"],"token_endpoint_auth_method":"none"}'

# open /authorize?... in browser, complete login, redeem code at /token
# then POST /mcp with Authorization: Bearer <id_token>
```

---

## Success criteria mapping

1. PRM `authorization_servers` — Tasks 1, 3, 7
2. AS metadata well-known — Tasks 3, 7
3. DCR — Task 4
4. Authorize → code → token (Firebase ID token) — Tasks 5–6
5. Token works on `/mcp` — Task 7 (Phase 1 verifier)
6. Refresh grant — Task 5
7. README — Task 7
8. Unit tests PKCE/TTL/DCR — Tasks 2–4

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-01-mcp-oauth-connect.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans  

Which approach?
