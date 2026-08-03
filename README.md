# MetraCards MCP

MCP server for MetraCards — manage decks and flashcards from **Cursor**, **Claude Desktop**, **Claude Code**, or **ChatGPT**.

You need a **MetraCards account** (same Google/Apple login as the app or website).

## Contents

- [Choose a mode](#choose-a-mode)
- [Tools](#tools)
- [Remote HTTP](#remote-http)
- [Local stdio](#local-stdio)
- [Check that it works](#check-that-it-works)
- [Troubleshooting](#troubleshooting)

## Choose a mode

| | **Remote HTTP** | **Local stdio** |
|---|---|---|
| When | Default for most clients | Local image/audio uploads without base64 |
| Connect | `https://mcp.metraedu.com.br/mcp` | Run `dist/index.js` on your machine |
| Auth | Browser OAuth / Connect | Call the `auth_login` tool once |
| Media | `content_base64` only | Prefer absolute `file_path` |

## Tools

| Tool | API / behavior |
|------|----------------|
| `health_check` | `GET /health` (no auth at API; HTTP transport still requires Connect or Bearer) |
| `auth_login` | stdio: browser Google/Apple → store refresh token → `POST /users`. HTTP: structured error (use Connect / Bearer) |
| `auth_logout` | stdio: clear local credentials. HTTP: structured error |
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

Typical card + image flow: authenticate → pick/create deck → create card → `cards_upload_media` → optional `cards_generate_audio`.

---

## Remote HTTP

**URL:** `https://mcp.metraedu.com.br/mcp`

No local build. Sign in with MetraCards in the browser when the client asks.

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

Requires **Node.js**. Fully quit Claude Desktop and reopen (reload is not enough).

### Claude Desktop (Connectors UI)

1. Customize → Connectors → Add custom connector
2. URL: `https://mcp.metraedu.com.br/mcp`
3. Connect → sign in to MetraCards
4. In a chat: **+ → Connectors** → enable MetraCards

No Client ID / Secret. Free plans usually allow one custom connector.

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
3. **MCP URL:** `https://mcp.metraedu.com.br/mcp`
4. **Authentication:** OAuth
5. Sign in to MetraCards, then enable the connector in a chat

---

## Local stdio

Use this when agents should upload files from disk via `file_path` (avoids large base64 in context).

### Requirements

- Node.js **20+**
- Clone of this repo, built once

```bash
git clone git@github.com:metraedu/metracards-mcp.git
cd metracards-mcp
npm install
npm run build
```

Firebase is baked into the package. No `.env` required for normal use.  
Optional: `.env` only to point at a local API (`METRACARDS_API_URL=http://127.0.0.1:3001`).

Ensure Firebase **Authorized domains** includes `localhost` (needed for `auth_login`).

### Standard config

Replace the path with the **absolute** path to your build:

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

Or use **View tools** → `auth_login`.

1. Browser opens on `http://127.0.0.1:<port>/`
2. Sign in with Google or Apple
3. Credentials saved at `~/.config/metracards-mcp/credentials.json` (`0600`)

Later tools refresh the token automatically. For media, prefer absolute `file_path`.

---

## Check that it works

Ask:

- *Am I signed in to MetraCards?* / call `auth_status`
- *List my decks.*
- *Create a test deck called MCP Trial.*

If decks appear in **your** account, you are done.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Server never starts | Fully quit the client (not just close the window) and reopen |
| `spawn node ENOENT` / `npx` not found | Install Node 20+ and ensure it is on PATH; on macOS GUI apps may need full path e.g. `/opt/homebrew/bin/node` |
| Invalid JSON / server ignored | Trailing commas break the whole `mcpServers` file — validate JSON |
| stdio tools say not authenticated | Call `auth_login` once |
| HTTP media upload fails with `file_path` | Hosted HTTP has no local disk — use `content_base64`, or switch to stdio |
| OAuth / login page fails on stdio | Add `localhost` under Firebase Authentication → Authorized domains |
