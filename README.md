# Bookmark Clipboard

A fast, self-hosted **bookmark dashboard with built-in clipboard and file sharing**. Organize
links by category, monitor services with optional ping checks, and share text snippets and files
across your local network — all from one page.

Ships as a single **Docker container**: pull it, run it, done. The backend is plain Node.js with
**zero external dependencies** (built-in modules only), so there's no build step and nothing to
install. It also exposes a small **HTTP API** so scripts — or an AI agent — can add, remove,
reorder and organize bookmarks for you.

---

## Features

- **📍 Organized bookmarks** — group links by category with one-click navigation
- **📋 Clipboard sharing** — paste text or attach files that sync across your network
- **💾 File attachments** — upload/download files of **any size** (no minimum, no maximum)
- **📌 Health monitoring** — optional ping checks show whether a service is online
- **🤖 Full API** — add / edit / move / reorder / organize bookmarks programmatically ([docs](#api--automation))
- **🌐 Network-accessible** — run on one machine, use it from any device on your LAN
- **🎨 Dark theme** — easy on the eyes, with a click-to-copy "info" tile type for IPs and keys

---

## Quick start

> Prerequisite: **Docker** with the Compose plugin (`docker compose`). Nothing else.

```bash
git clone https://github.com/heyitsmiike101/bookmark-clipboard.git
cd bookmark-clipboard
docker compose up -d
```

Then open **http://localhost:3000** — or `http://<host-ip>:3000` from another device on your network.

That's it. On first run the container seeds a starter `config.json` and stores everything on the
host at **`/home/user/Docker/bookmark-clipboard`** (see [Data & persistence](#data--persistence)).

### Updating

```bash
git pull
docker compose up -d --build
```

Your bookmarks and uploaded files live on the host volume, so they survive rebuilds and updates.

### Stopping / removing

```bash
docker compose down          # stop and remove the container (data is kept on the host)
```

---

## Data & persistence

All state lives in **one host directory**, bind-mounted into the container at `/data`:

```
/home/user/Docker/bookmark-clipboard/
├── config.json      # bookmarks + clips
└── attachments/     # uploaded files
```

This path is set in [`docker-compose.yml`](docker-compose.yml):

```yaml
    volumes:
      - /home/user/Docker/bookmark-clipboard:/data
```

- **Change the location** by editing the left side of that line (the right side, `:/data`, must stay).
- Docker creates the directory automatically on first run if it doesn't exist.
- If the container can't write to it, make sure the directory is writable (e.g. `chmod 777
  /home/user/Docker/bookmark-clipboard`, or `chown` it to the user the container runs as).

> Prefer a Docker-managed named volume instead of a host path? Replace the line above with
> `- bookmark-data:/data` and add a top-level `volumes:\n  bookmark-data:` block.

---

## Configuration

Settings are environment variables. Set them under `environment:` in `docker-compose.yml` or with
`-e` flags on `docker run`.

| Variable   | Default              | Description                                   |
|------------|----------------------|-----------------------------------------------|
| `PORT`     | `3000`               | Port the server listens on (inside container) |
| `HOST`     | `0.0.0.0`            | Bind address                                  |
| `DATA_DIR` | `/data`              | Where `config.json` and `attachments/` live   |

To serve on a different host port, change the `ports` mapping, e.g. `- "8080:3000"`.

---

## Using the dashboard

### Bookmarks
1. Click **⚙ Edit Config** to open the editor.
2. Add categories and bookmarks. For each bookmark:
   - Leave **Info** unchecked for a normal link; optionally enable **Ping** to show an online/offline dot.
   - Check **Info** to make a *click-to-copy* tile instead (great for IPs, API keys, notes).
3. Click **Save**.

### Clipboard & files
1. Type or paste text in the **Clipboard** section (Enter to save, Shift+Enter for a newline).
2. Check **Today only** to auto-delete a clip after today.
3. Click **📎 Attach** (or drag-and-drop) to upload files of any size.
4. Use **View / Copy / ✕** on each entry; filter by **Text / Files / Both**.

### Search
- The search bar filters bookmarks by name or category.
- Click a category header to collapse/expand it.

---

## API & Automation

Everything — bookmarks, categories, clips and files — is controllable over HTTP, so you can script
it or let an **AI agent add, remove, reorder and organize bookmarks**.

📖 **Open the full interactive reference at `http://localhost:3000/docs.html`** (also linked from the
in-app **?** Help panel). It documents every action with request/response examples and an AI-agent
usage guide.

All endpoints live under one path, `/api.php` (the name is kept for backward compatibility — it's
served by Node.js, not PHP), with the operation chosen by an `?action=` query parameter.

### Bookmarks & categories

| Method | Action | Description |
|--------|--------|-------------|
| GET    | `bookmarks` | Fetch the bookmarks tree + version |
| POST   | `bookmarks` | Replace the entire tree (bulk reorganize) |
| POST   | `add-bookmark` | Add a bookmark to a category (creates category if needed) |
| POST   | `update-bookmark` | Edit a bookmark's name / url / info / ping |
| POST/DELETE | `delete-bookmark` | Remove a bookmark |
| POST   | `move-bookmark` | Move a bookmark across or within categories |
| POST   | `reorder-bookmarks` | Reorder bookmarks within a category |
| POST   | `add-category` | Create an empty category |
| POST   | `rename-category` | Rename a category (keeps order + contents) |
| POST/DELETE | `delete-category` | Delete a category and its bookmarks |
| POST   | `reorder-categories` | Reorder the categories |

Each bookmark has a stable server-assigned `id` (e.g. `bm_abc123`). Edit/move/delete operations take
a **locator** — an `id`, or `category` + `index`, or `category` + `name`.

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

**Upload a file:**
```bash
curl -X POST "http://localhost:3000/api.php?action=upload" \
  -F "file=@/path/to/file.pdf" -F "todayOnly=0"
```

---

## Running without Docker

The server needs only **Node.js 18+** — no `npm install`.

```bash
node server.js
```

It serves on port `3000` and stores data in a `./data` directory next to `server.js` (override with
`DATA_DIR`).

---

## Project structure

```
bookmark-clipboard/
├── index.html          # Frontend (HTML + CSS + JavaScript)
├── docs.html           # API & automation reference page (served at /docs.html)
├── server.js           # Node.js backend (zero dependencies)
├── config.json         # Starter data (seeds the host volume on first run)
├── Dockerfile          # Container image
├── docker-compose.yml  # One-command deployment
└── README.md
```

---

## Troubleshooting

**Can't reach the dashboard**
- `docker compose ps` — is the container `Up`?
- `docker compose logs -f` — check for errors.
- Confirm the host port (default `3000`) isn't already in use or firewalled.

**Changes don't save / uploads fail**
- Open the in-app **?** Help panel for live storage diagnostics.
- Make sure the host volume directory is writable by the container.

**Clips not syncing across machines**
- All devices must reach `http://<host-ip>:3000` on the same network.

---

## License

MIT — use, modify, and distribute freely.
