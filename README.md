# metracards-mcp

MCP server for [MetraCards API](../metracards_api). Exposes tools that call the API with the same Firebase auth contract as metracards-web.

Current tools:

| Tool | API / behavior |
|------|----------------|
| `health_check` | `GET /health` (no auth) |
| `auth_login` | Browser Google/Apple login → store refresh token → `POST /users` |
| `auth_logout` | Clear local credentials |
| `auth_status` | Show whether credentials are stored |
| `decks_list` | `GET /decks` (auth; optional `since`) |
| `decks_get` | `GET /decks/{id}` (auth) |
| `decks_create` | `POST /decks` (auth) |
| `decks_update` | `PUT /decks/{id}` (auth) |
| `decks_delete` | `DELETE /decks/{id}` (auth) |

There is no Cursor **Authenticate** button for this server (stdio). Auth is the `auth_login` tool under **View tools**, or ask the agent to call it. Deck tools require a prior `auth_login`.

## Prerequisites

- Node.js 20+
- MetraCards API reachable (local SAM: `http://127.0.0.1:3001`)
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
| `npm run start:http` | HTTP transport stub (not implemented yet) |
| `npm test` | Unit tests |

## Auth flow

1. Call `auth_login` (optional `provider`: `google` | `apple`; default `google`).
2. Browser opens on `http://127.0.0.1:<port>/`.
3. Sign in with Google or Apple.
4. MCP stores the refresh token at `~/.config/metracards-mcp/credentials.json` (mode `0600`).
5. MCP calls `POST /users` with `Authorization: Bearer <idToken>` (parity with web `upsertUser`).
6. Later tools refresh the ID token automatically and send the Bearer header.

Never put tokens in chat logs. Tools never return tokens.

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

## HTTP transport

`npm run start:http` is a stub. Use stdio for Cursor and Claude until HTTP/SSE is implemented.
