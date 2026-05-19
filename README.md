# Bookmark Dashboard

A fast, self-hosted bookmark manager with integrated clipboard sharing. Organize links by category, monitor service availability with optional ping checks, and share text snippets and files across your local network.

## Features

- **📍 Organized Bookmarks** — Group links by category with one-click navigation
- **📋 Clipboard Sharing** — Paste text snippets or attach files that sync across your network
- **🌐 Network-Accessible** — Run on your local machine and access from any device on your network
- **📌 Health Monitoring** — Optional ping checks to see if services are online at a glance
- **💾 File Attachments** — Upload and download files through the clipboard section
- **⚡ Real-Time Sync** — Live updates when clipboard changes on another machine
- **🔍 Search & Filter** — Find bookmarks and filter clips by type (text/files)
- **🎨 Dark Theme** — Easy on the eyes with customizable accent colors

## Quick Start

### Prerequisites
- **Node.js** (for the Express server) or **PHP** (for the API backend)
- A modern web browser

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bookmark-dashboard.git
cd bookmark-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Create the initial config file (or copy `config.json` and edit as needed):
```json
{
  "bookmarks": {
    "My Links": [
      { "name": "Google", "url": "https://google.com" },
      { "name": "GitHub", "url": "https://github.com" }
    ]
  },
  "clips": []
}
```

4. Create an `attachments/` directory for file uploads:
```bash
mkdir attachments
```

5. Start the server:
```bash
npm start
```

6. Open your browser to `http://localhost:3000` (or your machine's IP on port 3000 from another device)

## Usage

### Managing Bookmarks

1. Click **⚙ Edit Config** to open the configuration modal
2. Add categories and bookmarks
3. Toggle **Info** to store IP addresses, API keys, or other info (click the tile to copy)
4. Enable **Ping** to monitor if a service is online
5. Click **Save**

### Sharing Text & Files

1. Paste or type text in the **Clipboard** section
2. Check **Today only** to auto-delete clips at midnight
3. Press Enter to save, or Shift+Enter for a new line
4. Click **📎 Attach** to upload files (multi-select supported)
5. Filter by **Text**, **Files**, or **Both**
6. Click **View** to expand, **Copy** to copy to clipboard, or **✕** to delete

### Filtering & Search

- Use the search bar to filter bookmarks by name or category
- Use the clip filter buttons to show only text, files, or both
- Click a category header to collapse/expand it

## File Structure

```
bookmark-dashboard/
├── index.html         # Frontend (HTML + CSS + JavaScript)
├── server.js          # Express server
├── api.php            # PHP backend API (alternative)
├── config.json        # Bookmark and clipboard data
├── attachments/       # File storage (user-created)
├── package.json       # Dependencies
└── README.md          # This file
```

## API Reference

### Node.js Server Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Fetch all bookmarks and clips |
| POST | `/api/bookmarks` | Save bookmarks config |
| POST | `/api/clips` | Add a new text clip |
| DELETE | `/api/clips/:id` | Delete a clip by ID |

### Request/Response Examples

**Save a text clip:**
```bash
curl -X POST http://localhost:3000/api/clips \
  -H "Content-Type: application/json" \
  -d '{"text":"My clipboard text"}'
```

**Save bookmarks:**
```bash
curl -X POST http://localhost:3000/api/bookmarks \
  -H "Content-Type: application/json" \
  -d '{
    "Work": [
      {"name":"Jira","url":"https://jira.company.com"}
    ]
  }'
```

## Configuration

Edit `config.json` directly or use the web UI:

```json
{
  "bookmarks": {
    "Category Name": [
      {
        "name": "Display Name",
        "url": "https://example.com",
        "ping": false
      },
      {
        "name": "Server IP",
        "info": "192.168.1.100"
      }
    ]
  },
  "clips": [
    {
      "id": "1234567890",
      "text": "Clipboard content",
      "type": "text",
      "createdAt": "2024-01-01T12:00:00Z",
      "todayOnly": false
    }
  ]
}
```

### Bookmark Options
- `name` (required) — Display name for the bookmark
- `url` (required for links) — Target URL
- `info` (optional) — Info tile; shows text you can click to copy (for IPs, keys, etc.)
- `ping` (optional) — If true, checks if the service is online with a favicon request

### Clip Options
- `type` — `"text"` or `"file"`
- `todayOnly` — If true, clip auto-deletes at midnight
- `filename` — For files: the stored filename
- `originalName` — For files: the name to show and download

## Development

### Running in Development Mode

Start the Express server with auto-reload:
```bash
npm start
```

### Deployment

For production:

1. **Node.js**: Use a process manager like `pm2`:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "bookmark-dashboard"
   pm2 startup
   pm2 save
   ```

2. **Nginx/Reverse Proxy**: Point a reverse proxy to `http://localhost:3000`

3. **File Permissions**: Ensure `config.json` and `attachments/` are writable by the process:
   ```bash
   chmod 664 config.json
   chmod 775 attachments
   ```

## Troubleshooting

### "Failed to reach api.php" error
- Ensure the server is running (`npm start`)
- Check that port 3000 is not blocked by a firewall
- Try accessing directly: `http://localhost:3000`

### Config changes not saving
- Verify `config.json` is writable
- Check server logs for errors
- Ensure no other process is modifying `config.json`

### Files not uploading
- Create the `attachments/` directory: `mkdir attachments`
- Check file permissions: `chmod 775 attachments`
- Verify disk space is available
- Check file size limits (default: no limit)

### Clips not syncing across machines
- Ensure all machines are on the same network
- Check firewall rules allow port 3000
- Verify the server is accessible from other machines: `http://<your-ip>:3000`

## License

MIT — Feel free to use, modify, and distribute.

## Contributing

Issues and pull requests are welcome!
