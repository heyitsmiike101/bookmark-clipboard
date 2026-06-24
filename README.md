# Bookmark Dashboard

A fast, self-hosted bookmark manager with integrated clipboard and file sharing. Organize links by category, monitor service availability with optional ping checks, and share text snippets and files across your local network.

Ships as a single **Docker container** — pull it, run it, and it just works. The backend is plain Node.js with **zero external dependencies** (built-in modules only), so there's no build step and nothing to install.

## Features

- **📍 Organized Bookmarks** — Group links by category with one-click navigation
- **📋 Clipboard Sharing** — Paste text snippets or attach files that sync across your network
- **🌐 Network-Accessible** — Run on your machine and access from any device on your network
- **📌 Health Monitoring** — Optional ping checks to see if services are online at a glance
- **💾 File Attachments** — Upload and download files of **any size** (no minimum, no maximum)
- **⚡ Real-Time Sync** — Live updates when the clipboard changes on another machine
- **🔍 Search & Filter** — Find bookmarks and filter clips by type (text/files)
- **🎨 Dark Theme** — Easy on the eyes with customizable accent colors

## Quick Start (Docker)

### Option A — Docker Compose (recommended)

```bash
git clone https://github.com/yourusername/bookmark-dashboard.git
cd bookmark-dashboard
docker compose up -d
```

Open **http://localhost:3000** (or `http://<your-machine-ip>:3000` from another device).

### Option B — Plain Docker

```bash
git clone https://github.com/yourusername/bookmark-dashboard.git
cd bookmark-dashboard
docker build -t bookmark-dashboard .
docker run -d --name bookmark-dashboard \
  -p 3000:3000 \
  -v bookmark-data:/data \
  --restart unless-stopped \
  bookmark-dashboard
```

That's it. The container seeds a starter `config.json` on first run and stores all data on the `/data` volume.

### Updating

```bash
git pull
docker compose up -d --build
```

Your bookmarks and uploaded files persist in the `bookmark-data` volume across rebuilds.

## Running Without Docker

The server only needs **Node.js 18+** — no `npm install` required.

```bash
node server.js
```

By default it serves on port `3000` and stores data in a `./data` directory next to `server.js`.

## Configuration

All settings are environment variables (set them in `docker-compose.yml` or via `-e` flags):

| Variable   | Default            | Description                                  |
|------------|--------------------|----------------------------------------------|
| `PORT`     | `3000`             | Port the server listens on                   |
| `HOST`     | `0.0.0.0`          | Bind address                                 |
| `DATA_DIR` | `/data` (container) | Where `config.json` and `attachments/` live |

### Data layout

Everything lives under `DATA_DIR` so it survives container rebuilds when mounted as a volume:

```
/data/
├── config.json     # bookmarks + clips
└── attachments/    # uploaded files
```

On first run, if `config.json` doesn't exist in the data directory, the bundled starter config is copied in automatically.

## Usage

### Managing Bookmarks

1. Click **⚙ Edit Config** to open the configuration modal
2. Add categories and bookmarks
3. Toggle **Info** to store IP addresses, API keys, or other text (click the tile to copy)
4. Enable **Ping** to monitor whether a service is online
5. Click **Save**

### Sharing Text & Files

1. Paste or type text in the **Clipboard** section
2. Check **Today only** to auto-delete clips at midnight
3. Press Enter to save, or Shift+Enter for a new line
4. Click **📎 Attach** to upload files (any size; empty files are fine)
5. Filter by **Text**, **Files**, or **Both**
6. Click **View** to expand, **Copy** to copy, or **✕** to delete

### Filtering & Search

- Use the search bar to filter bookmarks by name or category
- Use the clip filter buttons to show only text, files, or both
- Click a category header to collapse/expand it

## API & Automation

Everything — bookmarks, categories, clips and files — is controllable over HTTP, so
you can script it or let an **AI agent add, remove, reorder and organize bookmarks**.

📖 **Full interactive reference: open `http://localhost:3000/docs.html`** (also linked from the
in-app **?** Help panel). It documents every action with request/response examples and an
AI-agent usage guide.

All endpoints live under one path, `/api.php` (the name is kept for backward compatibility —
it's served by Node.js, not PHP), with the operation chosen by an `?action=` query parameter.

### Bookmarks & categories

| Method | Action | Description |
|--------|--------|-------------|
| GET    | `bookmarks` | Fetch the bookmarks tree + version |
| POST   | `bookmarks` | Replace the entire tree (bulk reorganize) |
| POST   | `add-bookmark` | Add a bookmark to a category (creates category if needed) |
| POST   | `update-bookmark` | Edit a bookmark's name/url/info/ping |
| POST/DELETE | `delete-bookmark` | Remove a bookmark |
| POST   | `move-bookmark` | Move a bookmark across/within categories |
| POST   | `reorder-bookmarks` | Reorder bookmarks within a category |
| POST   | `add-category` | Create an empty category |
| POST   | `rename-category` | Rename a category (keeps order + contents) |
| POST/DELETE | `delete-category` | Delete a category and its bookmarks |
| POST   | `reorder-categories` | Reorder the categories |

Each bookmark gets a stable server-assigned `id` (e.g. `bm_abc123`). Edit/move/delete
operations take a **locator** — an `id`, or a `category` + `index`, or a `category` + `name`.

### Clipboard, files & diagnostics

| Method | Action | Description |
|--------|--------|-------------|
| GET    | `config` | Fetch everything (bookmarks + clips + version) |
| GET    | `version` | Current version counter (poll to detect changes) |
| GET    | `health` | Runtime / storage diagnostics |
| POST   | `clip` | Add a text clip |
| POST   | `upload` | Upload a file (multipart; any size) |
| POST   | `update-clip&id=…` | Edit a text clip |
| DELETE | `clip&id=…&filename=…` | Delete a clip (and its file) |
| GET    | `download&filename=…&original=…` | Download an attachment |

### Examples

**Read the current bookmarks (start here for an agent):**
```bash
curl "http://localhost:3000/api.php?action=bookmarks"
```

**Add a bookmark:**
```bash
curl -X POST "http://localhost:3000/api.php?action=add-bookmark" \
  -H "Content-Type: application/json" \
  -d '{"category":"AI Tools","name":"Claude","url":"https://claude.ai","ping":true}'
```

**Move a bookmark to the top of another category:**
```bash
curl -X POST "http://localhost:3000/api.php?action=move-bookmark" \
  -H "Content-Type: application/json" \
  -d '{"id":"bm_abc123","toCategory":"Favorites","toIndex":0}'
```

**Bulk reorganize (replace the whole tree):**
```bash
curl -X POST "http://localhost:3000/api.php?action=bookmarks" \
  -H "Content-Type: application/json" \
  -d '{"Work":[{"name":"Jira","url":"https://jira.company.com"}]}'
```

**Upload a file:**
```bash
curl -X POST "http://localhost:3000/api.php?action=upload" \
  -F "file=@/path/to/file.pdf" -F "todayOnly=0"
```

## Config Format

```json
{
  "bookmarks": {
    "Category Name": [
      { "name": "Display Name", "url": "https://example.com", "ping": false },
      { "name": "Server IP", "info": "192.168.1.100" }
    ]
  },
  "clips": []
}
```

### Bookmark options
- `name` (required) — Display name
- `url` (required for links) — Target URL
- `info` (optional) — Info tile; click to copy (for IPs, keys, etc.)
- `ping` (optional) — If true, checks whether the service is online via a favicon request

### Clip options
- `type` — `"text"` or `"file"`
- `todayOnly` — If true, the clip auto-deletes at midnight
- `filename` — For files: the stored filename
- `originalName` — For files: the name shown and used for download

## File Structure

```
bookmark-dashboard/
├── index.html          # Frontend (HTML + CSS + JavaScript)
├── docs.html           # API & automation reference page
├── Bookmarks.html      # Optional standalone static bookmarks page
├── server.js           # Node.js backend (zero dependencies)
├── config.json         # Starter bookmark/clip data (seeds /data on first run)
├── package.json        # Metadata + start script
├── Dockerfile          # Container image definition
├── docker-compose.yml  # One-command deployment
└── README.md           # This file
```

## Troubleshooting

**Can't reach the dashboard**
- Confirm the container is running: `docker compose ps` / `docker ps`
- Check logs: `docker compose logs -f` / `docker logs bookmark-dashboard`
- Make sure port `3000` isn't blocked by a firewall

**Changes not saving / uploads failing**
- Open the **Help** modal in the UI to see live storage diagnostics
- Ensure the `/data` volume is writable by the container

**Clips not syncing across machines**
- All machines must be on the same network and able to reach `http://<your-ip>:3000`

## License

MIT — feel free to use, modify, and distribute.
