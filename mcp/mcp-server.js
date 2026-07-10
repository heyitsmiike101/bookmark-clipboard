#!/usr/bin/env node
'use strict';

/*
 * Bookmark Clipboard — MCP server
 *
 * A Model Context Protocol server that gives an AI clean, well-described tools
 * for the Bookmark Clipboard dashboard instead of raw `?action=` HTTP calls.
 *
 * Zero dependencies (Node built-ins only). Speaks JSON-RPC 2.0 over stdio
 * (newline-delimited), which is the MCP stdio transport.
 *
 * Point it at your running dashboard with the BOOKMARK_API_URL env var, e.g.
 *   BOOKMARK_API_URL=http://debian-docker:6970 node mcp-server.js
 * (defaults to http://localhost:3000)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const API_BASE = process.env.BOOKMARK_API_URL || 'http://localhost:3000';
const SERVER_INFO = { name: 'bookmark-clipboard', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

// ── HTTP helper: call the dashboard's /api endpoint ──────────────────────────
function apiCall(method, action, { query = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL('/api', API_BASE);
    } catch (e) {
      reject(new Error('Invalid BOOKMARK_API_URL: ' + API_BASE));
      return;
    }
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const lib = url.protocol === 'https:' ? https : http;
    const data = body != null ? JSON.stringify(body) : null;
    const headers = data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {};
    const req = lib.request(url, { method, headers }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        let parsed = buf;
        try { parsed = buf ? JSON.parse(buf) : null; } catch (e) { /* leave as text */ }
        if (res.statusCode >= 400) {
          const msg = (parsed && parsed.error) || ('HTTP ' + res.statusCode);
          reject(new Error(msg));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on('error', (e) => reject(new Error('Cannot reach dashboard at ' + API_BASE + ' — ' + e.message)));
    if (data) req.write(data);
    req.end();
  });
}

// Drop undefined keys so we don't send empties.
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ── Tool definitions ─────────────────────────────────────────────────────────
// Each: { name, description, inputSchema (JSON Schema), handler(args) -> data }
const S = (props, required = []) => ({ type: 'object', properties: props, required, additionalProperties: false });
const str = (description) => ({ type: 'string', description });
const bool = (description) => ({ type: 'boolean', description });
const int = (description) => ({ type: 'integer', description });
const strArr = (description) => ({ type: 'array', items: { type: 'string' }, description });

const LOCATOR_NOTE = 'Identify the bookmark by `id` (from list_bookmarks — most reliable), or by `category` + `name`, or `category` + `index` (0-based).';

const TOOLS = [
  // ── Read ──
  {
    name: 'list_bookmarks',
    description: 'List all bookmark categories and their bookmarks (each with a stable `id`). Call this first before editing, moving, or deleting bookmarks.',
    inputSchema: S({}),
    handler: () => apiCall('GET', 'bookmarks'),
  },
  {
    name: 'list_clips',
    description: 'List all clipboard entries (text and files), each with a unique `id`, `tags`, and metadata.',
    inputSchema: S({}),
    handler: () => apiCall('GET', 'clips'),
  },
  {
    name: 'list_tags',
    description: 'List every clip tag currently in use, with usage counts.',
    inputSchema: S({}),
    handler: () => apiCall('GET', 'tags'),
  },
  {
    name: 'get_config',
    description: 'Fetch the entire dashboard state (bookmarks + clips + version).',
    inputSchema: S({}),
    handler: () => apiCall('GET', 'config'),
  },

  // ── Bookmarks ──
  {
    name: 'add_bookmark',
    description: 'Add a bookmark to a category (the category is created if it does not exist). Provide EITHER `url` (a link tile) OR `info` (a click-to-copy value like an IP or API key), not both.',
    inputSchema: S({
      category: str('Category to add the bookmark to (created if missing).'),
      name: str('Display name.'),
      url: str('Target URL — makes a normal link tile.'),
      info: str('A value to store instead of a URL (IP, API key, note) — makes a click-to-copy tile.'),
      ping: bool('If true (link tiles only), show an online/offline status dot.'),
      index: int('Insert position within the category (default: end).'),
    }, ['category', 'name']),
    handler: (a) => apiCall('POST', 'add-bookmark', { body: clean({ category: a.category, name: a.name, url: a.url, info: a.info, ping: a.ping, index: a.index }) }),
  },
  {
    name: 'update_bookmark',
    description: 'Edit a bookmark. ' + LOCATOR_NOTE + ' Then set any of new_name/url/info/ping. Setting `info` converts it to an info tile; setting `url` converts it to a link tile.',
    inputSchema: S({
      id: str('Bookmark id (preferred).'),
      category: str('Category (with name or index) if not using id.'),
      name: str('Current name, to locate the bookmark within its category.'),
      index: int('0-based position within the category, to locate it.'),
      new_name: str('New display name.'),
      url: str('New URL (converts to a link tile).'),
      info: str('New info value (converts to an info tile).'),
      ping: bool('Enable/disable the status dot (link tiles).'),
    }),
    handler: (a) => apiCall('POST', 'update-bookmark', { body: clean({
      id: a.id, category: a.category, name: a.name, index: a.index,
      fields: clean({ name: a.new_name, url: a.url, info: a.info, ping: a.ping }),
    }) }),
  },
  {
    name: 'delete_bookmark',
    description: 'Delete a bookmark. ' + LOCATOR_NOTE,
    inputSchema: S({
      id: str('Bookmark id (preferred).'),
      category: str('Category, if locating by category + name/index.'),
      name: str('Name within the category.'),
      index: int('0-based index within the category.'),
    }),
    handler: (a) => apiCall('POST', 'delete-bookmark', { body: clean({ id: a.id, category: a.category, name: a.name, index: a.index }) }),
  },
  {
    name: 'move_bookmark',
    description: 'Move a bookmark to another category and/or position. ' + LOCATOR_NOTE,
    inputSchema: S({
      id: str('Bookmark id (preferred).'),
      category: str('Current category, if locating by category + name/index.'),
      name: str('Current name within the category.'),
      index: int('Current 0-based index within the category.'),
      to_category: str('Destination category (created if missing; default: same category).'),
      to_index: int('Destination position (default: end).'),
    }),
    handler: (a) => apiCall('POST', 'move-bookmark', { body: clean({ id: a.id, category: a.category, name: a.name, index: a.index, toCategory: a.to_category, toIndex: a.to_index }) }),
  },
  {
    name: 'reorder_bookmarks',
    description: 'Set the order of bookmarks within a category. `order` is a list of ids or names; any omitted keep their relative order at the end.',
    inputSchema: S({
      category: str('The category to reorder.'),
      order: strArr('Bookmark ids or names in the desired order.'),
    }, ['category', 'order']),
    handler: (a) => apiCall('POST', 'reorder-bookmarks', { body: { category: a.category, order: a.order } }),
  },

  // ── Categories ──
  {
    name: 'add_category',
    description: 'Create a new, empty bookmark category.',
    inputSchema: S({ category: str('Name of the new category.'), index: int('Position among categories (default: end).') }, ['category']),
    handler: (a) => apiCall('POST', 'add-category', { body: clean({ category: a.category, index: a.index }) }),
  },
  {
    name: 'rename_category',
    description: 'Rename a bookmark category, keeping its order and contents.',
    inputSchema: S({ category: str('Existing category name.'), new_name: str('New category name.') }, ['category', 'new_name']),
    handler: (a) => apiCall('POST', 'rename-category', { body: { category: a.category, newName: a.new_name } }),
  },
  {
    name: 'delete_category',
    description: 'Delete a category AND all bookmarks in it.',
    inputSchema: S({ category: str('Category to delete.') }, ['category']),
    handler: (a) => apiCall('POST', 'delete-category', { body: { category: a.category } }),
  },
  {
    name: 'reorder_categories',
    description: 'Set the order of categories. Omitted categories are appended in their original order.',
    inputSchema: S({ order: strArr('Category names in the desired order.') }, ['order']),
    handler: (a) => apiCall('POST', 'reorder-categories', { body: { order: a.order } }),
  },

  // ── Clipboard ──
  {
    name: 'add_text_clip',
    description: 'Add a text entry to the shared clipboard. Text supports Markdown. Returns the created clip with its unique id.',
    inputSchema: S({
      text: str('The clip text (Markdown supported).'),
      tags: strArr('Optional tags to attach.'),
      today_only: bool('If true, auto-delete after today.'),
    }, ['text']),
    handler: (a) => apiCall('POST', 'clip', { body: clean({ text: a.text, tags: a.tags, todayOnly: a.today_only }) }),
  },
  {
    name: 'add_file_clip',
    description: 'Add a file to the shared clipboard from content you provide (no multipart upload needed). Give EITHER `content_text` (UTF-8 text) OR `content_base64` (binary), plus a filename.',
    inputSchema: S({
      filename: str('Display / download filename, e.g. "report.txt".'),
      content_text: str('Plain UTF-8 file content.'),
      content_base64: str('Base64-encoded file bytes (for binary files).'),
      tags: strArr('Optional tags to attach.'),
      today_only: bool('If true, auto-delete after today.'),
    }, ['filename']),
    handler: (a) => apiCall('POST', 'add-file', { body: clean({ filename: a.filename, contentText: a.content_text, contentBase64: a.content_base64, tags: a.tags, todayOnly: a.today_only }) }),
  },
  {
    name: 'update_clip',
    description: "Edit an existing clip by id: change a text clip's `text`, and/or replace `tags` (on any clip), and/or toggle `today_only`.",
    inputSchema: S({
      id: str('The clip id (from list_clips).'),
      text: str('New text (text clips only).'),
      tags: strArr('Replace the clip\'s tags with this list (empty list clears them).'),
      today_only: bool('Set the auto-delete-after-today flag.'),
    }, ['id']),
    handler: (a) => apiCall('POST', 'update-clip', { query: { id: a.id }, body: clean({ text: a.text, tags: a.tags, todayOnly: a.today_only }) }),
  },
  {
    name: 'delete_clip',
    description: 'Delete a clipboard entry by id (its stored file, if any, is removed too).',
    inputSchema: S({ id: str('The clip id (from list_clips).') }, ['id']),
    handler: (a) => apiCall('POST', 'delete-clip', { body: { id: a.id } }),
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

// ── JSON-RPC dispatch ────────────────────────────────────────────────────────
async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: (params && typeof params.protocolVersion === 'string') ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
    case 'tools/call': {
      const tool = TOOL_BY_NAME[params && params.name];
      if (!tool) return { content: [{ type: 'text', text: 'Unknown tool: ' + (params && params.name) }], isError: true };
      try {
        const data = await tool.handler((params && params.arguments) || {});
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    }
    default: {
      const err = new Error('Method not found: ' + method);
      err.rpcCode = -32601;
      throw err;
    }
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return;
  const { id, method, params } = msg;
  // Notifications (no id, e.g. notifications/initialized) get no response.
  if (id === undefined || id === null) return;
  try {
    const result = await dispatch(method, params || {});
    send({ jsonrpc: '2.0', id, result });
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: e.rpcCode || -32603, message: e.message } });
  }
}

// ── stdio transport: newline-delimited JSON-RPC ──────────────────────────────
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { continue; }
    if (Array.isArray(msg)) msg.forEach(handleMessage);
    else handleMessage(msg);
  }
});
process.stdin.on('end', () => process.exit(0));

// Logs MUST go to stderr — stdout is reserved for JSON-RPC.
console.error(`[bookmark-clipboard MCP] ready — talking to ${API_BASE}`);
