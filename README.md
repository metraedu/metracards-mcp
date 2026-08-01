# metracards-mcp

MCP server for [MetraCards API](../metracards_api). Exposes tools that call the API.

Current tools:

| Tool | API |
|------|-----|
| `health_check` | `GET /health` |

## Prerequisites

- Node.js 20+
- MetraCards API reachable (local SAM: `http://127.0.0.1:3001`)

## Setup

```bash
cd metracards-mcp
npm install
cp .env.example .env   # optional; defaults to http://127.0.0.1:3001
npm run build
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` / `npm run start:stdio` | Run MCP over stdio |
| `npm run start:http` | HTTP transport stub (not implemented yet) |
| `npm test` | Unit tests |

## Install in Cursor

1. Build this package (`npm run build`).
2. Open Cursor Settings → MCP, or edit the project file `.cursor/mcp.json` (or global `~/.cursor/mcp.json`).
3. Add:

```json
{
  "mcpServers": {
    "metracards": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js"],
      "env": {
        "METRACARDS_API_URL": "http://127.0.0.1:3001"
      }
    }
  }
}
```

4. Replace `/ABSOLUTE/PATH/TO/metracards-mcp` with the real path.
5. Restart MCP / reload Cursor and confirm the `metracards` server is connected.
6. Ask the agent to run `health_check`.

## Install in Claude Desktop

1. Build this package (`npm run build`).
2. Edit the Claude Desktop config:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add under `mcpServers`:

```json
{
  "mcpServers": {
    "metracards": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js"],
      "env": {
        "METRACARDS_API_URL": "http://127.0.0.1:3001"
      }
    }
  }
}
```

4. Fully quit and reopen Claude Desktop.
5. Confirm tools are available and call `health_check`.

## Install in Claude Code

From the project directory (or with absolute path):

```bash
claude mcp add metracards --env METRACARDS_API_URL=http://127.0.0.1:3001 -- node /ABSOLUTE/PATH/TO/metracards-mcp/dist/index.js
```

Or add the same `command` / `args` / `env` block to your Claude Code MCP settings JSON.

## Pointing at another API URL

Set `METRACARDS_API_URL` in `.env` (for local runs) or in the MCP `env` block (Cursor / Claude). No trailing slash.

## HTTP transport

`npm run start:http` is a stub. Use stdio for Cursor and Claude until HTTP/SSE is implemented.
