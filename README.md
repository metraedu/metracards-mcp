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
| `npm test` | Unit tests |

## OAuth Connect

Start the server with `npm start`. HTTP requires the complete Firebase web configuration and `FIREBASE_PROJECT_ID`; Firebase must authorize the public hostname in production.

OAuth-capable MCP clients such as ChatGPT Connect discover Protected Resource Metadata at `/.well-known/oauth-protected-resource` (or its `/mcp` variant), then:

1. Register a public client with `POST /register` (DCR).
2. Send the user to `GET /authorize` with an S256 PKCE challenge.
3. Exchange the returned authorization code at `POST /token`.
4. Call `POST /mcp` with the returned `Authorization: Bearer <Firebase ID token>`.

Manual HTTP clients can supply a Firebase ID token directly as a Bearer token.

The OAuth client and authorization-code store is in memory. It is lost on restart and is not safe behind a multi-instance load balancer; use a shared durable store before deploying multiple instances.

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

## Pointing at another API URL

Set `METRACARDS_API_URL` in `.env`. No trailing slash.
