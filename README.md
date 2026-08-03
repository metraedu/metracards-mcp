# MetraCards MCP

MCP server for [MetraCards](https://metraedu.com.br). Create and manage decks and flashcards from Cursor, Claude Desktop, Claude Code, or ChatGPT.

You need a MetraCards account (the same Google or Apple login used in the app and website).

## Contents

- [Choose a mode](#choose-a-mode)
- [Tools](#tools)
- [Remote HTTP](#remote-http)
- [Local stdio](#local-stdio)
- [Check that it works](#check-that-it-works)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Choose a mode

| | Remote HTTP | Local stdio |
|---|---|---|
| When | Default for most clients | Local image/audio uploads without base64 |
| Connect | `https://mcp.metraedu.com.br/mcp` | Run `dist/index.js` on your machine |
| Auth | Browser OAuth / Connect | Call the `auth_login` tool once |
| Media | `content_base64` only | Prefer absolute `file_path` |

## Tools

| Tool | API / behavior |
|------|----------------|
| `health_check` | `GET /health`. No auth at the API; HTTP transport requires Connect or Bearer. |
| `auth_login` | stdio: browser Google/Apple → store refresh token → `POST /users`. HTTP: structured error (use Connect or Bearer). |
| `auth_logout` | stdio: clear local credentials. HTTP: structured error. |
| `auth_status` | Check whether a uid/token is available via `TokenProvider` for the current request. |
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
| `cards_upload_media` | Presign and S3 PUT from `file_path` or `content_base64` (one or the other, not both). |
| `cards_generate_audio` | `POST /audio` → upload TTS to S3 |
| `reviews_list` | `GET /reviews` (auth; optional `card_id`, `since`) |
| `reviews_get` | `GET /reviews/{id}` (auth) |
| `reviews_create` | `POST /reviews` (auth) |
| `reviews_delete` | `DELETE /reviews/{id}` (auth; soft-delete) |
| `reviews_create_batch` | `POST /reviews/batch` (auth; 1–500) |
| `reviews_delete_batch` | `POST /reviews/batch/delete` (auth; 1–500 ids) |
| `schedules_list` | `GET /review-schedules` (auth; optional `since`) |
| `schedules_get` | `GET /review-schedules/{id}` (auth) |
| `schedules_create` | `POST /review-schedules` (auth) |
| `schedules_update` | `PUT /review-schedules/{id}` (auth) |
| `schedules_delete` | `DELETE /review-schedules/{id}` (auth; soft-delete) |
| `schedules_create_batch` | `POST /review-schedules/batch` (auth; 1–500) |
| `schedules_delete_batch` | `POST /review-schedules/batch/delete` (auth; 1–500 ids) |
| `decks_create_batch` | `POST /decks/batch` (auth; 1–100) |
| `decks_delete_batch` | `POST /decks/batch/delete` (auth; 1–100 ids) |
| `cards_create_batch` | `POST /flashcards/batch` (auth; 1–500) |
| `cards_delete_batch` | `POST /flashcards/batch/delete` (auth; 1–500 ids) |
| `stats_usage` | `GET /users/usage-stats` (auth) |
| `stats_activity` | `GET /activity` (auth; optional `months` 1–24) |

Typical flow: authenticate, pick or create a deck, create a card, call `cards_upload_media`, then optionally `cards_generate_audio`.

---

## Remote HTTP

URL: `https://mcp.metraedu.com.br/mcp`

No local build required. Sign in with MetraCards in the browser when the client asks.

### Standard config (Claude Desktop via mcp-remote)

Settings → Developer → Edit Config (`claude_desktop_config.json`):

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "metracards": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.metraedu.com.br/mcp",
        "--transport",
        "http-only"
      ]
    }
  }
}
```

Requires Node.js. Fully quit Claude Desktop and reopen. Closing the window alone is not enough.

### Claude Desktop (Connectors UI)

1. Customize → Connectors → Add custom connector
2. URL: `https://mcp.metraedu.com.br/mcp`
3. Connect → sign in to MetraCards
4. In a chat: + → Connectors → enable MetraCards

No Client ID or Secret required. Most free plans allow one custom connector.

### Claude Code

```bash
claude mcp add --transport http metracards https://mcp.metraedu.com.br/mcp
```

Then `/mcp` in Claude Code and finish browser login if prompted.

Project scope (writes `.mcp.json`):

```bash
claude mcp add --transport http metracards --scope project \
  https://mcp.metraedu.com.br/mcp
```

### Cursor (HTTP)

`~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "metracards": {
      "url": "https://mcp.metraedu.com.br/mcp"
    }
  }
}
```

Or Settings → MCP → add the same URL. Complete OAuth when Cursor prompts.

### ChatGPT

1. Enable Developer mode (Settings → Apps & Connectors → Advanced, or similar)
2. Create connector / app
3. MCP URL: `https://mcp.metraedu.com.br/mcp`
4. Authentication: OAuth
5. Sign in to MetraCards, then enable the connector in a chat

---

## Local stdio

Use this when agents need to upload files from disk via `file_path`, which avoids sending large base64 strings in the context.

### Requirements

- Node.js 20+
- Clone of this repo, built once

```bash
git clone git@github.com:metraedu/metracards-mcp.git
cd metracards-mcp
npm install
npm run build
```

Firebase is included with the package. You do not need a `.env` file for normal use. To point at a local API, set `METRACARDS_API_URL=http://127.0.0.1:3001` in `.env`.

Add `localhost` to Firebase Authentication → Authorized domains (required for `auth_login`).

### Standard config

Replace the path with the absolute path to your build:

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

### Cursor

Paste the standard config into `~/.cursor/mcp.json` or `.cursor/mcp.json`, then reload MCP / restart Cursor.

### Claude Desktop

Paste the standard config into `claude_desktop_config.json` (paths above). Fully quit and reopen Claude.

### Claude Code

```bash
claude mcp add metracards -- node /ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js
```

Project scope:

```bash
claude mcp add metracards --scope project -- \
  node /ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js
```

### First login (stdio only)

There is no separate Authenticate button. In chat:

> Call `auth_login` for MetraCards

Or use View tools → `auth_login`.

1. Browser opens on `http://127.0.0.1:<port>/`
2. Sign in with Google or Apple
3. Credentials are saved at `~/.config/metracards-mcp/credentials.json` with restricted permissions

Later tools refresh the token automatically. For media uploads, use absolute `file_path` when possible.

---

## Check that it works

Ask:

- *Am I signed in to MetraCards?* or call `auth_status`
- *List my decks.*
- *Create a test deck called MCP Trial.*

If your decks appear, you are set up correctly.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server never starts | Fully quit the client (not just close the window) and reopen |
| `spawn node ENOENT` / `npx` not found | Install Node 20+ and ensure it is on PATH; on macOS GUI apps may need the full path, e.g. `/opt/homebrew/bin/node` |
| Invalid JSON / server ignored | Trailing commas in the JSON break the whole `mcpServers` file. Validate it. |
| stdio tools say not authenticated | Call `auth_login` once |
| HTTP media upload fails with `file_path` | Hosted HTTP has no local disk. Use `content_base64`, or switch to stdio. |
| OAuth / login page fails on stdio | Add `localhost` under Firebase Authentication → Authorized domains |

## License

MIT. See [LICENSE](LICENSE).
