# MetraCards MCP — Lambda Hosting (Phase 3) Design

**Date:** 2026-08-02  
**Status:** Approved — pending implementation plan  
**Repo:** `metracards-mcp`  
**Depends on:** Phase 2 OAuth Connect — [`2026-08-01-mcp-oauth-connect-design.md`](./2026-08-01-mcp-oauth-connect-design.md)

## Goal

Host the existing Streamable HTTP MCP (OAuth Connect + Bearer) on **AWS Lambda** behind **`https://mcp.metraedu.com.br`**, with a **durable DynamoDB OAuth store**, using **CDK** in this repo — at low cost for low traffic.

## Scope

| In | Out |
|----|-----|
| CDK app under `metracards-mcp/infrastructure/` | CI/CD deploy pipeline |
| Lambda + Lambda Web Adapter + Express | Lightsail / EC2 / Fargate |
| API Gateway HTTP API + custom domain | Function URL as public entry |
| Route53 A/ALIAS + ACM (cert ARN via context) | Multi-region |
| DynamoDB on-demand OAuth store (clients, codes, pending) | Secrets Manager (unless later needed) |
| Env wiring for Firebase web + API URL + canonical MCP URLs | Tool/schema changes |
| Unit tests (Dynamo store) + CDK snapshot | X-Ray / alarms / advanced observability |
| README deploy + Firebase authorized domain notes | CIMD, npm publish, Store listing |
| | Rate limiting on `/register` (still deferred) |
| | Consent screen for client/redirect (still deferred) |

## Architecture

```
Client (ChatGPT Connect / Cursor / Bearer)
        │ HTTPS
        ▼
https://mcp.metraedu.com.br
        │
  API Gateway HTTP API (custom domain)
  ACM certificate + Route53 A/ALIAS (zone metraedu.com.br)
        │
        ▼
  Lambda (Node 20) + Lambda Web Adapter
  Express: /mcp, OAuth routes, well-known, login HTML
        │
        ├─ DynamoDB (on-demand) → clients, auth codes, pending authorize
        └─ HTTPS                → MetraCards API (existing)
```

### Decisions

| Topic | Choice |
|-------|--------|
| Compute | Lambda Node 20 |
| Express bridge | Lambda Web Adapter (keep `listen`; local `npm start` unchanged) |
| Public entry | API Gateway HTTP API only (no public Function URL) |
| API Gateway auth | NONE — app enforces Bearer / OAuth |
| Domain | `mcp.metraedu.com.br` |
| DNS | Route53 same account as MetraCards API |
| TLS | ACM cert ARN from CDK context (same pattern as API) |
| IaC | CDK TypeScript in `metracards-mcp/infrastructure/` |
| OAuth durability | DynamoDB single-table, on-demand |
| Local/dev store | In-memory when table env unset |
| Config secrets | Firebase web config via Lambda env from CDK context (public client config) |

## App changes

1. Extract Express app construction (e.g. `createHttpApp(...)`) shared by local entry and Adapter-hosted process.
2. Keep `OAuthStore` as the contract; rename current impl to memory store.
3. Add `DynamoOAuthStore` implementing the same contract.
4. Move `pendingRequests` out of the in-router `Map` in `authorize.ts` into the store (or an extended store API) so authorize → callback works across Lambda instances.
5. Store selection: if `METRACARDS_MCP_OAUTH_TABLE` is set → Dynamo; else → memory.
6. Production canonical URLs:
   - `METRACARDS_MCP_RESOURCE_URL=https://mcp.metraedu.com.br/mcp`
   - issuer / allowed hosts derived from that origin
7. No tool catalog or schema changes.

## DynamoDB model

Single table, `PAY_PER_REQUEST`, TTL attribute `expiresAt` (epoch seconds).

| pk | sk | Purpose | TTL |
|----|----|---------|-----|
| `CLIENT#<clientId>` | `META` | DCR registered client | none (or long-lived) |
| `CODE#<code>` | `META` | Auth code + Firebase tokens / PKCE | ~2 minutes |
| `PENDING#<loginState>` | `META` | Pre-login authorize state | ~10 minutes |

- Consume paths use strongly consistent reads and one-time delete (conditional where useful).
- No Streams, PITR, DAX, or global tables.

## CDK stack

Under `infrastructure/`:

- DynamoDB table (TTL enabled on `expiresAt`)
- Lambda:
  - Web Adapter extension/layer
  - Bundle or asset of MCP app
  - Env: Firebase web fields, `METRACARDS_API_URL`, MCP resource/issuer/allowed hosts, `METRACARDS_MCP_OAUTH_TABLE`
  - Timeout **120s**; memory **1024 MB** (headroom for TTS/media proxy work)
  - IAM: least-privilege DynamoDB on that table only
- HTTP API with proxy routes to the Lambda
- Custom domain `mcp.metraedu.com.br` + base path mapping / API mapping
- Route53 alias to the HTTP API domain name
- Output: `McpUrl` = `https://mcp.metraedu.com.br/mcp`

### CDK context (shape)

```json
{
  "metracards-mcp:env": { "account": "...", "region": "us-east-1" },
  "metracards-mcp:domain": {
    "domainName": "mcp.metraedu.com.br",
    "certificateArn": "arn:aws:acm:...",
    "route53": {
      "hostedZoneId": "Z...",
      "hostedZoneName": "metraedu.com.br"
    }
  },
  "metracards-mcp:firebase": {
    "apiKey": "...",
    "authDomain": "...",
    "projectId": "...",
    "storageBucket": "...",
    "messagingSenderId": "...",
    "appId": "..."
  },
  "metracards-mcp:apiUrl": "https://..."
}
```

### Post-deploy (manual)

Add `mcp.metraedu.com.br` to Firebase **Authorized domains**.

## Error handling / ops notes

- OAuth invalid/expired code or missing pending state → existing OAuth error responses (`invalid_grant`, `invalid_request`, …)
- Dynamo transient errors → 5xx from AS routes; do not leak internals
- Cold starts expected at low volume; acceptable for agent clients
- MCP treated as **stateless per request** (no sticky session requirement)

## Testing

- Unit: Dynamo store (mock client) — client CRUD, code save/consume/TTL, pending TTL, double-consume
- Unit: existing DCR / authorize / token tests still pass on memory store
- CDK snapshot: HTTP API, domain wiring, Lambda env, IAM
- Manual smoke after deploy:
  1. PRM / AS well-known on the custom domain
  2. Connect flow or Bearer `POST /mcp`
  3. `health_check` + `decks_list`

## Success criteria

1. `https://mcp.metraedu.com.br/mcp` serves authenticated MCP.
2. OAuth Connect works across Lambda cold starts / distinct instances (Dynamo-backed).
3. Local `npm start` without Dynamo env still uses memory store.
4. CDK in this repo can deploy the stack with context for domain + Firebase + API URL.
5. README documents deploy, env, and Firebase authorized domain.
6. Unit + CDK snapshot tests cover the new pieces above.

## Cost posture (expected)

- DynamoDB OAuth traffic at low volume ≈ negligible (on-demand).
- Lambda + HTTP API pay-per-use; idle cost near zero aside from tiny Dynamo storage.
- Dominant variable risk: CloudWatch Logs retention/verbosity.
