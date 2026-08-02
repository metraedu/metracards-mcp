# metracards-mcp

MCP server for [MetraCards API](../metracards_api). Exposes tools that call the API with the same Firebase auth contract as metracards-web.

Transport: **Streamable HTTP** at `/mcp`. Authenticate with **OAuth Connect** or `Authorization: Bearer <Firebase ID token>`.

Current tools:

| Tool | API / behavior |
|------|----------------|
| `health_check` | `GET /health` (no auth at API; HTTP transport requires OAuth Connect or Bearer) |
| `auth_status` | Whether a uid/token is available via `TokenProvider` for the current request |
| `decks_list` | `GET /decks` (auth; optional `since`) |
| `decks_get` | `GET /decks/{id}` (auth) |
| `decks_create` | `POST /decks` (auth) |
| `decks_update` | `PUT /decks/{id}` (auth) |
| `decks_delete` | `DELETE /decks/{id}` (auth) |
| `cards_list` | `GET /flashcards` (auth; optional `deck_id`, `since`) |
| `cards_get` | `GET /flashcards/{id}` (auth) |
| `cards_create` | `POST /flashcards` (auth) |
| `cards_update` | `PUT /flashcards/{id}` (auth) |
| `cards_delete` | `DELETE /flashcards/{id}` (auth) |
| `cards_upload_media` | Presign + S3 PUT from `file_path` **XOR** `content_base64` |
| `cards_generate_audio` | `POST /audio` → upload TTS to S3 |

## Create a card with images

1. Authenticate (OAuth Connect or Bearer)
2. Choose/create a deck (`decks_list` / `decks_create`)
3. Generate a flashcard UUID
4. `cards_upload_media` with exactly one of:
   - absolute `file_path` (works when the file exists on the MCP host)
   - `content_base64` (preferred for remote clients; optional `content_type`, `file_extension`)
5. `cards_create` with the same `id`, `deck_id`, `front`, `back`, and media URL/size fields if you need them on create (upload already attaches when the card exists)

For TTS: `cards_generate_audio` attaches audio to an existing card.

## Prerequisites

- Node.js 20+
- MetraCards API reachable (default prod API Gateway; local SAM: `http://127.0.0.1:3001`)
- Firebase web config (same project as metracards-web)
- Firebase authorized domain includes the public hostname used for OAuth login (and `localhost` for local dev)

## Setup

```bash
cd metracards-mcp
npm install
cp .env.example .env
# copy FIREBASE_* from metracards-web (VITE_FIREBASE_* without the VITE_ prefix)
# optionally set METRACARDS_API_URL
npm run build
```

The process loads `.env` from this package root.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` (+ copy OAuth login page) |
| `npm start` / `npm run start:http` | Run Streamable HTTP on `/mcp` |
| `npm test` | Unit tests (does **not** run infra tests) |
| `npm run test:infra` | CDK snapshot assertions |
| `npm run test:all` | Unit tests + CDK snapshot assertions (CI entrypoint) |
| `npm run synth` | Synthesize CloudFormation (`cdk synth`) |
| `npm run deploy` | Deploy stack (`cdk deploy`) |

## OAuth Connect

Start the server with `npm start`. HTTP requires the complete Firebase web configuration and `FIREBASE_PROJECT_ID`; Firebase must authorize the public hostname in production.

OAuth-capable MCP clients such as ChatGPT Connect discover Protected Resource Metadata at `/.well-known/oauth-protected-resource` (or its `/mcp` variant), then:

1. Register a public client with `POST /register` (DCR).
2. Send the user to `GET /authorize` with an S256 PKCE challenge.
3. Exchange the returned authorization code at `POST /token`.
4. Call `POST /mcp` with the returned `Authorization: Bearer <Firebase ID token>`.

Manual HTTP clients can supply a Firebase ID token directly as a Bearer token.

OAuth state (DCR clients, auth codes, pending authorize) uses an in-memory store locally and DynamoDB in production (see [AWS deployment](#aws-deployment)).

### HTTP env

| Variable | Default | Purpose |
|----------|---------|---------|
| `METRACARDS_MCP_HTTP_HOST` | `127.0.0.1` | Bind address |
| `METRACARDS_MCP_HTTP_PORT` | `3000` | Port |
| `METRACARDS_MCP_RESOURCE_URL` | `http://127.0.0.1:3000/mcp` | Canonical `resource` in PRM |
| `METRACARDS_MCP_ISSUER_URL` | origin of resource URL | OAuth AS issuer / metadata base |
| `METRACARDS_MCP_AUTH_SERVERS` | issuer URL | PRM `authorization_servers` override |
| `METRACARDS_MCP_ALLOWED_HOSTS` | host of resource URL | `Host` allowlist |
| `METRACARDS_MCP_MAX_MEDIA_BYTES` | `10485760` | Max decoded `content_base64` |
| `METRACARDS_MCP_OAUTH_TABLE` | *(unset locally)* | DynamoDB table name; CDK sets this on Lambda |

## AWS deployment

Production: **Lambda** (Node 22 + Lambda Web Adapter) behind **API Gateway HTTP API** with custom domain **`mcp.metraedu.com.br`**, **DynamoDB** for durable OAuth state, and Route53 alias + ACM TLS. CDK lives under `infrastructure/` and requires TypeScript 5.9+ (already pinned in `devDependencies`).

### CDK context

Context lives in the **repo-root `cdk.json`** (not `infrastructure/cdk.json`, which is unused). The committed `cdk.json` only has placeholder values so `npm run synth` works out of the box for anyone who clones the repo. Shape:

```json
{
  "metracards-mcp:env": { "account": "...", "region": "us-east-1" },
  "metracards-mcp:domain": {
    "domainName": "mcp.metraedu.com.br",
    "certificateArn": "arn:aws:acm:us-east-1:...:certificate/...",
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

| Context key | Purpose |
|-------------|---------|
| `metracards-mcp:env` | AWS account and region |
| `metracards-mcp:domain` | Custom domain, ACM cert ARN, optional Route53 zone |
| `metracards-mcp:firebase` | Firebase web config (same values as metracards-web) |
| `metracards-mcp:apiUrl` | MetraCards API base URL (no trailing slash) |

**Real values for an actual deploy do not belong in `cdk.json`.** CDK automatically loads a `cdk.context.json` next to `cdk.json` (repo root) and merges it over the base context, and `cdk.context.json` is gitignored — put real account/domain/Firebase/API values there. `cdk.context.example.json` documents the shape with placeholders; copy it to get started:

```bash
cp cdk.context.example.json cdk.context.json
# edit cdk.context.json with real values
```

Note: **nested `-c` flags do not work for these object-shaped context keys.** `cdk` passes `-c` values as plain strings, so e.g. `-c metracards-mcp:domain.domainName=...` will not merge into the `metracards-mcp:domain` object the way `loadMcpConfig` expects — use `cdk.context.json` instead.

### Bootstrap and deploy

The target AWS account/region needs to be [bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) once before the first deploy:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION
```

Then synth/deploy:

```bash
npm install
npm run build
npm run synth          # validate template (uses cdk.context.json if present, else placeholders)
npx cdk deploy         # or: npm run deploy
```

Stack outputs: `McpUrl` (`https://mcp.metraedu.com.br/mcp`) and `OAuthStoreTableName`.

### Post-deploy (Firebase)

In the Firebase console → **Authentication** → **Settings** → **Authorized domains**, add **`mcp.metraedu.com.br`**. Without this, browser login during OAuth Connect fails on the production hostname.

### Local OAuth store

Leave **`METRACARDS_MCP_OAUTH_TABLE` unset** in `.env` for `npm start`. The app uses the in-memory store (state lost on restart; fine for single-process local dev). Lambda receives the table name from CDK automatically.

### Manual smoke checklist (after deploy)

1. **Well-known metadata** — PRM and AS discovery on the custom domain:
   ```bash
   curl -sS https://mcp.metraedu.com.br/.well-known/oauth-protected-resource | jq .
   curl -sS https://mcp.metraedu.com.br/.well-known/oauth-authorization-server | jq .
   ```
2. **Authenticated MCP** — `POST https://mcp.metraedu.com.br/mcp` with `Authorization: Bearer <Firebase ID token>`; run `health_check` and `decks_list`.
3. **Optional — Connect durability** — full DCR → authorize → token flow, then repeat after a cold start (wait >10 min or force a new Lambda instance) to confirm Dynamo-backed OAuth survives restarts.

## Pointing at another API URL

Set `METRACARDS_API_URL` in `.env`. No trailing slash.
