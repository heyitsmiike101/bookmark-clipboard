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

## API Reference

The frontend talks to a single endpoint, `api.php` (the name is kept for backward
compatibility — it's served by Node.js, not PHP), using an `action` query parameter.

| Method | Endpoint                                            | Description                         |
|--------|-----------------------------------------------------|-------------------------------------|
| GET    | `/api.php?action=config`                            | Fetch all bookmarks and clips       |
| GET    | `/api.php?action=version`                           | Get the config version number       |
| GET    | `/api.php?action=health`                            | Server / storage diagnostics        |
| GET    | `/api.php?action=download&filename=…&original=…`    | Download an attachment              |
| POST   | `/api.php?action=bookmarks`                         | Save the bookmarks object           |
| POST   | `/api.php?action=clip`                              | Add a text clip (JSON body)         |
| POST   | `/api.php?action=upload`                            | Upload a file (multipart form-data) |
| POST   | `/api.php?action=update-clip&id=…`                  | Edit a text clip                    |
| DELETE | `/api.php?action=clip&id=…&filename=…`              | Delete a clip (and its file)        |

### Examples

**Add a text clip:**
```bash
curl -X POST "http://localhost:3000/api.php?action=clip" \
  -H "Content-Type: application/json" \
  -d '{"text":"My clipboard text","todayOnly":false}'
```

**Save bookmarks:**
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
