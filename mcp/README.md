# Bookmark Clipboard — MCP server

An [MCP](https://modelcontextprotocol.io) server that gives an AI assistant
clean, well-described **tools** for your Bookmark Clipboard dashboard, instead of
making it reverse-engineer the raw `?action=` HTTP API.

- **Zero dependencies** — pure Node.js (built-ins only), no `npm install`.
- Talks JSON-RPC 2.0 over stdio (the MCP stdio transport).
- Wraps the dashboard's HTTP API, so it works against any running instance.

## Requirements

- **Node.js 18+**
- A running Bookmark Clipboard dashboard reachable over HTTP (e.g.
  `http://localhost:3000` or `http://debian-docker:6970`).

## Configuration

The server reads one environment variable:

| Variable           | Default                 | Description                                   |
|--------------------|-------------------------|-----------------------------------------------|
| `BOOKMARK_API_URL` | `http://localhost:3000` | Base URL of your running dashboard (no `/api`). |

### Claude Desktop

Edit `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bookmark-clipboard": {
      "command": "node",
      "args": ["/absolute/path/to/bookmark-clipboard/mcp/mcp-server.js"],
      "env": { "BOOKMARK_API_URL": "http://debian-docker:6970" }
    }
  }
}
```

Restart Claude Desktop, and the tools appear under a 🔌 icon.

### Claude Code

```bash
claude mcp add bookmark-clipboard \
  -e BOOKMARK_API_URL=http://debian-docker:6970 \
  -- node /absolute/path/to/bookmark-clipboard/mcp/mcp-server.js
```

### Any other MCP client

Run the command below; the client speaks JSON-RPC to it over stdio:

```bash
BOOKMARK_API_URL=http://debian-docker:6970 node /path/to/mcp/mcp-server.js
```

## Tools

**Bookmarks & categories**

| Tool | Purpose |
|------|---------|
| `list_bookmarks` | List categories + bookmarks (with ids). Call before editing/moving/deleting. |
| `add_bookmark` | Add a link tile (`url`) or click-to-copy info tile (`info`). |
| `update_bookmark` | Edit name / url / info / ping. |
| `delete_bookmark` | Remove a bookmark. |
| `move_bookmark` | Move across / within categories. |
| `reorder_bookmarks` | Reorder within a category. |
| `add_category` / `rename_category` / `delete_category` / `reorder_categories` | Manage categories. |

**Clipboard**

| Tool | Purpose |
|------|---------|
| `list_clips` | List all clipboard entries (ids, tags, metadata). |
| `add_text_clip` | Add a text entry (Markdown supported), optional tags. |
| `add_file_clip` | Add a file from `content_text` or `content_base64`. |
| `update_clip` | Edit a clip's text / tags / today-only flag. |
| `delete_clip` | Remove a clip. |
| `list_tags` | All clip tags in use, with counts. |

**Diagnostics**

| Tool | Purpose |
|------|---------|
| `get_config` | Fetch the whole dashboard state. |

Bookmarks and clips carry stable ids (`bm_…`, `clip_…`). Bookmark edit/move/delete
tools accept a **locator**: an `id` (best), or `category` + `name`, or
`category` + `index`.

## Notes

- The dashboard API has no authentication — run this against a trusted LAN
  instance, the same as the dashboard itself.
- The server logs only to **stderr**; stdout is reserved for the MCP protocol.
