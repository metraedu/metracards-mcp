# metracards-mcp

MCP server for [MetraCards API](../metracards_api). Exposes tools that call the API with the same Firebase auth contract as metracards-web.

One MCP, two transports: **stdio** (local agents) and **Streamable HTTP** (hosted-ready). Tool names and schemas are identical on both.

Current tools:

| Tool | API / behavior |
|------|----------------|
| `health_check` | `GET /health` (no auth at API; HTTP transport requires OAuth Connect or Bearer) |
| `auth_login` | stdio: browser Google/Apple → store refresh token → `POST /users`. HTTP: structured error (use OAuth Connect or Bearer) |
| `auth_logout` | stdio: clear local credentials. HTTP: structured error |
| `auth_status` | Whether a uid/token is available via `TokenProvider` |
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

There is no Cursor **Authenticate** button for the stdio server. Auth is the `auth_login` tool under **View tools**, or ask the agent to call it. For HTTP, send `Authorization: Bearer <Firebase ID token>`.

## Create a card with images

1. Authenticate (`auth_login` on stdio, or Bearer on HTTP)
2. Choose/create a deck (`decks_list` / `decks_create`)
3. Generate a flashcard UUID
4. `cards_upload_media` with exactly one of:
   - absolute `file_path` (works when the file exists on the MCP host — typical for local stdio)
   - `content_base64` (preferred for remote/HTTP clients; optional `content_type`, `file_extension`)
5. `cards_create` with the same `id`, `deck_id`, `front`, `back`, and media URL/size fields if you need them on create (upload already attaches when the card exists)

For TTS: `cards_generate_audio` attaches audio to an existing card.

## Prerequisites

- Node.js 20+
- MetraCards API reachable (default prod API Gateway; local SAM: `http://127.0.0.1:3001`)
- Firebase web config (same project as metracards-web)
- Firebase authorized domain includes `localhost` (required for the local login page)
- Apple Sign-In configured in Firebase if you use `provider: "apple"`

## Setup

```bash
cd metracards-mcp
npm install
cp .env.example .env
# copy FIREBASE_* from metracards-web (VITE_FIREBASE_* without the VITE_ prefix)
# optionally set METRACARDS_API_URL
npm run build
```

The process loads `.env` from this package root (not from the Cursor cwd). You do **not** need to put Firebase secrets in `mcp.json`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` (+ copy login page) |
| `npm start` / `npm run start:stdio` | Run MCP over stdio |
| `npm run start:http` | Run Streamable HTTP on `/mcp` |
| `npm test` | Unit tests |

## Auth flow (stdio)

1. Call `auth_login` (optional `provider`: `google` | `apple`; default `google`).
2. Browser opens on `http://127.0.0.1:<port>/`.
3. Sign in with Google or Apple.
4. MCP stores the refresh token at `~/.config/metracards-mcp/credentials.json` (mode `0600`).
5. MCP calls `POST /users` with `Authorization: Bearer <idToken>` (parity with web `upsertUser`).
6. Later tools refresh the ID token automatically and send the Bearer header.

Never put tokens in chat logs. Tools never return tokens.

## OAuth Connect (Phase 2)

Start the server with `npm run start:http`. HTTP requires the complete Firebase web configuration and `FIREBASE_PROJECT_ID`; Firebase must authorize the public hostname in production.

OAuth-capable MCP clients such as ChatGPT Connect discover Protected Resource Metadata at `/.well-known/oauth-protected-resource` (or its `/mcp` variant), then:

1. Register a public client with `POST /register` (DCR).
2. Send the user to `GET /authorize` with an S256 PKCE challenge.
3. Exchange the returned authorization code at `POST /token`.
4. Call `POST /mcp` with the returned `Authorization: Bearer <Firebase ID token>`.

Manual HTTP clients can still supply a Firebase ID token directly as a Bearer token. The stdio transport is unchanged: use its `auth_login` tool to complete local browser login and persist credentials.

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

## Install in Cursor

1. Build this package (`npm run build`) and ensure `.env` is filled.
2. Open Cursor Settings → MCP, or edit `~/.cursor/mcp.json`.
3. Add:

```json
{
  "mcpServers": {
    "metracards": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js"]
    }
  }
}
```

4. Replace the absolute path. Optional: add an `env` block only to override `.env` (e.g. another `METRACARDS_API_URL`).
5. Reconnect the `metracards` MCP / reload Cursor.
6. Call `auth_login`, then `auth_status` / `health_check`.

## Install in Claude Desktop

1. Build this package and fill `.env`.
2. Edit the Claude Desktop config:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add the same minimal `mcpServers.metracards` block as Cursor (command + args only).
4. Fully quit and reopen Claude Desktop.

## Install in Claude Code

With `.env` already filled in the package:

```bash
claude mcp add metracards -- node /ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js
```

Pass `--env KEY=value` only when you need to override `.env`.

## Pointing at another API URL

Set `METRACARDS_API_URL` in `.env` (preferred) or in the MCP `env` override. No trailing slash.

Optional credentials path override: `METRACARDS_MCP_CREDENTIALS_PATH`.
