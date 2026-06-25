'use strict';

/*
 * Bookmark Dashboard — Node.js backend
 *
 * All operations are served under /api, selected by an ?action=... query
 * parameter (e.g. /api?action=config).
 *
 * Zero external dependencies (built-in modules only) so the Docker image
 * builds and runs without any network access or `npm install`.
 *
 * Data lives under DATA_DIR (default ./data, /data in the container):
 *   DATA_DIR/config.json     bookmarks + clips
 *   DATA_DIR/attachments/    uploaded files
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const APP_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(APP_DIR, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const SEED_CONFIG = path.join(APP_DIR, 'config.json');

// ── Bootstrap data directory ──────────────────────────────────────────────
fs.mkdirSync(ATTACH_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  if (fs.existsSync(SEED_CONFIG)) {
    fs.copyFileSync(SEED_CONFIG, CONFIG_FILE);
  } else {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ bookmarks: {}, clips: [] }, null, 2));
  }
}

// ── Config helpers ──────────────────────────────────────────────────────────
function readConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!data.bookmarks) data.bookmarks = {};
    if (!Array.isArray(data.clips)) data.clips = [];
    return data;
  } catch (e) {
    return { bookmarks: {}, clips: [] };
  }
}

function writeConfig(data) {
  data.version = (data.version || 0) + 1;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function idsMatch(a, b) {
  return String(a) === String(b);
}

function newBookmarkId() {
  return 'bm_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// Clip ids carry random entropy so rapid AI-driven posts never collide.
function newClipId() {
  return 'clip_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// Ensure every clip has a unique id. Returns whether anything changed so the
// caller can avoid a needless write (and version bump).
function normalizeClips(clips) {
  if (!Array.isArray(clips)) return { clips: [], changed: clips !== undefined && clips !== null };
  let changed = false;
  const seen = new Set();
  for (const c of clips) {
    if (c && typeof c === 'object') {
      if (!c.id || seen.has(String(c.id))) { c.id = newClipId(); changed = true; }
      seen.add(String(c.id));
    }
  }
  return { clips, changed };
}

// Normalize a tags value into a clean string array. Accepts an array, a JSON
// array string, or a comma-separated string. Trims, drops empties, caps length,
// and dedupes case-insensitively (keeping the first-seen casing). 0..unlimited.
function parseTags(input) {
  let arr = [];
  if (Array.isArray(input)) {
    arr = input;
  } else if (typeof input === 'string') {
    const s = input.trim();
    if (s.startsWith('[')) { try { const j = JSON.parse(s); if (Array.isArray(j)) arr = j; } catch (e) {} }
    if (!arr.length && s) arr = s.split(',');
  }
  const out = [];
  const seen = new Set();
  for (let t of arr) {
    t = String(t).trim().slice(0, 80);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// Ensure every bookmark has a unique stable `id`. Returns whether anything
// changed so callers can avoid pointless writes (and version bumps).
function normalizeBookmarks(bookmarks) {
  if (!bookmarks || typeof bookmarks !== 'object' || Array.isArray(bookmarks)) {
    return { bookmarks: {}, changed: bookmarks !== undefined && bookmarks !== null };
  }
  let changed = false;
  const seen = new Set();
  for (const cat of Object.keys(bookmarks)) {
    if (!Array.isArray(bookmarks[cat])) { bookmarks[cat] = []; changed = true; continue; }
    for (const bm of bookmarks[cat]) {
      if (bm && typeof bm === 'object') {
        if (!bm.id || seen.has(bm.id)) { bm.id = newBookmarkId(); changed = true; }
        seen.add(bm.id);
      }
    }
  }
  return { bookmarks, changed };
}

// Resolve a bookmark from a flexible locator:
//   { id }                       — preferred, searches all categories
//   { category, index }          — 0-based position within a category
//   { category, name }           — first bookmark with that name in a category
// Returns { category, index } or null.
function findBookmark(bookmarks, loc) {
  if (loc.id) {
    for (const cat of Object.keys(bookmarks)) {
      const i = (bookmarks[cat] || []).findIndex((b) => b && b.id === loc.id);
      if (i !== -1) return { category: cat, index: i };
    }
    return null;
  }
  if (loc.category && Array.isArray(bookmarks[loc.category])) {
    const list = bookmarks[loc.category];
    if (loc.index !== undefined && loc.index !== null && loc.index !== '') {
      const idx = parseInt(loc.index, 10);
      if (!isNaN(idx) && idx >= 0 && idx < list.length) return { category: loc.category, index: idx };
      return null;
    }
    if (loc.name) {
      const i = list.findIndex((b) => b && b.name === loc.name);
      if (i !== -1) return { category: loc.category, index: i };
    }
  }
  return null;
}

// Clamp an insertion index into [0, len].
function clampIndex(value, len, dflt) {
  if (value === undefined || value === null || value === '') return dflt;
  let idx = parseInt(value, 10);
  if (isNaN(idx) || idx < 0) return dflt;
  return Math.min(idx, len);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return null;
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return null;
  }
}

// ── Static file serving ─────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Resolve safely inside APP_DIR to prevent path traversal.
  const filePath = path.normalize(path.join(APP_DIR, rel));
  if (!filePath.startsWith(APP_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ── Streaming multipart/form-data parser ────────────────────────────────────
// Parses a single-file upload (frontend sends one file plus a `todayOnly`
// field per request). Files are streamed straight to disk so uploads of any
// size — including 0-byte files — are accepted without buffering in memory.
function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const boundaryBuf = Buffer.from('--' + boundary);
    let buffer = Buffer.alloc(0);
    const fields = {};
    let file = null; // { fieldName, filename, contentType, stream, size, tmpPath }
    let inFilePart = false;
    let finished = false;
    let pending = 0; // outstanding write-stream finishes

    function maybeDone() {
      if (finished && pending === 0) {
        resolve({ fields, file });
      }
    }

    function startPart(headerStr) {
      const dispo = /name="([^"]*)"(?:;\s*filename="([^"]*)")?/i.exec(headerStr);
      const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
      const fieldName = dispo ? dispo[1] : '';
      const filename = dispo && dispo[2] !== undefined ? dispo[2] : null;
      if (filename !== null) {
        // File part: stream to a temp file.
        const tmpPath = path.join(ATTACH_DIR, '.upload_' + crypto.randomBytes(8).toString('hex') + '.tmp');
        file = {
          fieldName,
          filename,
          contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          size: 0,
          tmpPath,
          stream: fs.createWriteStream(tmpPath),
        };
        inFilePart = true;
      } else {
        // Regular field: collect value in memory.
        inFilePart = false;
        currentField = { name: fieldName, value: Buffer.alloc(0) };
      }
    }

    let currentField = null;

    function appendPartData(chunk) {
      if (inFilePart && file) {
        file.size += chunk.length;
        pending++;
        const ok = file.stream.write(chunk, () => { pending--; maybeDone(); });
        if (!ok) {
          // Backpressure: pause until drain.
          req.pause();
          file.stream.once('drain', () => req.resume());
        }
      } else if (currentField) {
        currentField.value = Buffer.concat([currentField.value, chunk]);
      }
    }

    function endPart() {
      if (inFilePart && file && file.stream) {
        pending++;
        file.stream.end(() => { pending--; maybeDone(); });
      } else if (currentField) {
        fields[currentField.name] = currentField.value.toString('utf8');
        currentField = null;
      }
      inFilePart = false;
    }

    let state = 'preamble'; // preamble -> headers -> data

    req.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      let keepGoing = true;
      while (keepGoing) {
        keepGoing = false;
        if (state === 'preamble' || state === 'data') {
          // Look for the next boundary.
          const idx = buffer.indexOf(boundaryBuf);
          if (idx === -1) {
            if (state === 'data') {
              // Flush all but a tail that might contain a partial boundary.
              const safe = buffer.length - boundaryBuf.length;
              if (safe > 0) {
                appendPartData(buffer.slice(0, safe));
                buffer = buffer.slice(safe);
              }
            }
            break;
          }
          if (state === 'data') {
            // Emit data up to the boundary (minus the preceding CRLF).
            let end = idx;
            if (end >= 2 && buffer[end - 2] === 0x0d && buffer[end - 1] === 0x0a) end -= 2;
            appendPartData(buffer.slice(0, end));
            endPart();
          }
          // Advance past the boundary marker.
          let after = idx + boundaryBuf.length;
          // Closing boundary "--boundary--"
          if (buffer.slice(after, after + 2).toString() === '--') {
            finished = true;
            buffer = Buffer.alloc(0);
            break;
          }
          // Skip trailing CRLF after boundary.
          if (buffer.slice(after, after + 2).toString() === '\r\n') after += 2;
          buffer = buffer.slice(after);
          state = 'headers';
          keepGoing = true;
        } else if (state === 'headers') {
          const sep = buffer.indexOf('\r\n\r\n');
          if (sep === -1) break; // need more data
          const headerStr = buffer.slice(0, sep).toString('utf8');
          buffer = buffer.slice(sep + 4);
          startPart(headerStr);
          state = 'data';
          keepGoing = true;
        }
      }
    });

    req.on('end', () => {
      finished = true;
      maybeDone();
    });
    req.on('error', reject);
  });
}

function sanitizeName(name) {
  let safe = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.slice(0, 180);
}

// ── Route handlers ──────────────────────────────────────────────────────────
async function handleApi(req, res, urlObj) {
  const method = req.method;
  const action = urlObj.searchParams.get('action') || '';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // File download — stream before any JSON headers.
  if (method === 'GET' && action === 'download') {
    const filename = path.basename(urlObj.searchParams.get('filename') || '');
    const filepath = path.join(ATTACH_DIR, filename);
    if (!filename || !fs.existsSync(filepath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const original = urlObj.searchParams.get('original') || filename;
    const stat = fs.statSync(filepath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + path.basename(original).replace(/"/g, '\\"') + '"',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filepath).pipe(res);
    return;
  }

  const config = readConfig();

  if (method === 'GET' && action === 'health') {
    const stat = (p) => {
      try { fs.accessSync(p, fs.constants.R_OK); } catch (e) { return false; }
      return true;
    };
    const writable = (p) => {
      try { fs.accessSync(p, fs.constants.W_OK); } catch (e) { return false; }
      return true;
    };
    sendJson(res, 200, {
      runtime: 'Node ' + process.version,
      config_exists: fs.existsSync(CONFIG_FILE),
      config_readable: stat(CONFIG_FILE),
      config_writable: writable(CONFIG_FILE),
      attachments_exists: fs.existsSync(ATTACH_DIR),
      attachments_readable: stat(ATTACH_DIR),
      attachments_writable: writable(ATTACH_DIR),
      upload_limit: 'unlimited',
      data_dir: DATA_DIR,
    });
    return;
  }

  if (method === 'GET' && action === 'version') {
    sendJson(res, 200, { version: config.version || 0 });
    return;
  }

  if (method === 'GET' && action === 'config') {
    sendJson(res, 200, config);
    return;
  }

  // ── Bookmarks: read ─────────────────────────────────────────────────────
  if (method === 'GET' && action === 'bookmarks') {
    sendJson(res, 200, { bookmarks: config.bookmarks, version: config.version || 0 });
    return;
  }

  // ── Bookmarks: bulk replace / organize ──────────────────────────────────
  if (method === 'POST' && action === 'bookmarks') {
    const body = await readJsonBody(req);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      sendJson(res, 400, { error: 'Invalid data — expected a { category: [...] } object' });
      return;
    }
    config.bookmarks = normalizeBookmarks(body).bookmarks;
    writeConfig(config);
    sendJson(res, 200, { ok: true, bookmarks: config.bookmarks, version: config.version });
    return;
  }

  // ── Bookmarks: add one ──────────────────────────────────────────────────
  if (method === 'POST' && action === 'add-bookmark') {
    const body = await readJsonBody(req) || {};
    const category = String(body.category || '').trim();
    const name = String(body.name || '').trim();
    if (!category || !name) { sendJson(res, 400, { error: 'category and name are required' }); return; }
    const hasInfo = body.info !== undefined && body.info !== null;
    if (!hasInfo && !body.url) { sendJson(res, 400, { error: 'Provide either a url or an info value' }); return; }
    const bm = { id: newBookmarkId(), name };
    if (hasInfo) {
      bm.info = String(body.info);
    } else {
      bm.url = String(body.url);
      if (body.ping) bm.ping = true;
    }
    if (!Array.isArray(config.bookmarks[category])) config.bookmarks[category] = [];
    const list = config.bookmarks[category];
    const idx = clampIndex(body.index, list.length, list.length);
    list.splice(idx, 0, bm);
    writeConfig(config);
    sendJson(res, 200, { ok: true, bookmark: bm, category, index: idx });
    return;
  }

  // ── Bookmarks: update one ───────────────────────────────────────────────
  if (method === 'POST' && action === 'update-bookmark') {
    const body = await readJsonBody(req) || {};
    const target = findBookmark(config.bookmarks, body);
    if (!target) { sendJson(res, 404, { error: 'Bookmark not found for the given locator' }); return; }
    const bm = config.bookmarks[target.category][target.index];
    const f = (body.fields && typeof body.fields === 'object') ? body.fields : {};
    if (f.name !== undefined) bm.name = String(f.name);
    if (f.info !== undefined && f.info !== null) {
      // Convert to / stay an info tile.
      bm.info = String(f.info);
      delete bm.url; delete bm.ping;
    } else if (f.url !== undefined) {
      // Convert to / stay a link tile.
      bm.url = String(f.url);
      delete bm.info;
      if (f.ping !== undefined) { if (f.ping) bm.ping = true; else delete bm.ping; }
    } else if (f.ping !== undefined && bm.url !== undefined) {
      if (f.ping) bm.ping = true; else delete bm.ping;
    }
    writeConfig(config);
    sendJson(res, 200, { ok: true, bookmark: bm, category: target.category, index: target.index });
    return;
  }

  // ── Bookmarks: delete one ───────────────────────────────────────────────
  if ((method === 'POST' || method === 'DELETE') && action === 'delete-bookmark') {
    const body = (method === 'POST') ? (await readJsonBody(req) || {}) : {};
    const loc = {
      id: body.id || urlObj.searchParams.get('id') || undefined,
      category: body.category || urlObj.searchParams.get('category') || undefined,
      name: body.name || urlObj.searchParams.get('name') || undefined,
      index: body.index !== undefined ? body.index : urlObj.searchParams.get('index'),
    };
    const target = findBookmark(config.bookmarks, loc);
    if (!target) { sendJson(res, 404, { error: 'Bookmark not found for the given locator' }); return; }
    const [removed] = config.bookmarks[target.category].splice(target.index, 1);
    writeConfig(config);
    sendJson(res, 200, { ok: true, removed, category: target.category });
    return;
  }

  // ── Bookmarks: move / reorder across or within categories ───────────────
  if (method === 'POST' && action === 'move-bookmark') {
    const body = await readJsonBody(req) || {};
    const target = findBookmark(config.bookmarks, body);
    if (!target) { sendJson(res, 404, { error: 'Bookmark not found for the given locator' }); return; }
    const toCategory = String(body.toCategory || target.category).trim() || target.category;
    const [bm] = config.bookmarks[target.category].splice(target.index, 1);
    if (!Array.isArray(config.bookmarks[toCategory])) config.bookmarks[toCategory] = [];
    const dest = config.bookmarks[toCategory];
    const idx = clampIndex(body.toIndex, dest.length, dest.length);
    dest.splice(idx, 0, bm);
    writeConfig(config);
    sendJson(res, 200, { ok: true, bookmark: bm, fromCategory: target.category, toCategory, toIndex: idx });
    return;
  }

  // ── Bookmarks: reorder within a category ────────────────────────────────
  if (method === 'POST' && action === 'reorder-bookmarks') {
    const body = await readJsonBody(req) || {};
    const category = String(body.category || '').trim();
    if (!Array.isArray(config.bookmarks[category])) { sendJson(res, 404, { error: 'Category not found' }); return; }
    if (!Array.isArray(body.order)) { sendJson(res, 400, { error: 'order must be an array of ids, names, or indices' }); return; }
    const list = config.bookmarks[category];
    const used = new Set();
    const result = [];
    for (const key of body.order) {
      let i = -1;
      if (typeof key === 'number') {
        if (key >= 0 && key < list.length && !used.has(key)) i = key;
      } else {
        i = list.findIndex((b, idx) => !used.has(idx) && b && b.id === key);
        if (i === -1) i = list.findIndex((b, idx) => !used.has(idx) && b && b.name === key);
        if (i === -1 && /^\d+$/.test(String(key))) {
          const n = parseInt(key, 10);
          if (n >= 0 && n < list.length && !used.has(n)) i = n;
        }
      }
      if (i !== -1) { used.add(i); result.push(list[i]); }
    }
    list.forEach((b, idx) => { if (!used.has(idx)) result.push(b); });
    config.bookmarks[category] = result;
    writeConfig(config);
    sendJson(res, 200, { ok: true, category, order: result.map((b) => ({ id: b.id, name: b.name })) });
    return;
  }

  // ── Categories: add ─────────────────────────────────────────────────────
  if (method === 'POST' && action === 'add-category') {
    const body = await readJsonBody(req) || {};
    const category = String(body.category || '').trim();
    if (!category) { sendJson(res, 400, { error: 'category is required' }); return; }
    if (config.bookmarks[category] !== undefined) { sendJson(res, 409, { error: 'Category already exists' }); return; }
    if (body.index === undefined || body.index === null || body.index === '') {
      config.bookmarks[category] = [];
    } else {
      const entries = Object.entries(config.bookmarks);
      const at = clampIndex(body.index, entries.length, entries.length);
      entries.splice(at, 0, [category, []]);
      config.bookmarks = Object.fromEntries(entries);
    }
    writeConfig(config);
    sendJson(res, 200, { ok: true, category });
    return;
  }

  // ── Categories: rename ──────────────────────────────────────────────────
  if (method === 'POST' && action === 'rename-category') {
    const body = await readJsonBody(req) || {};
    const category = String(body.category || '').trim();
    const newName = String(body.newName || '').trim();
    if (!category || !newName) { sendJson(res, 400, { error: 'category and newName are required' }); return; }
    if (config.bookmarks[category] === undefined) { sendJson(res, 404, { error: 'Category not found' }); return; }
    if (category === newName) { sendJson(res, 200, { ok: true, from: category, to: newName }); return; }
    if (config.bookmarks[newName] !== undefined) { sendJson(res, 409, { error: 'A category with newName already exists' }); return; }
    const entries = Object.entries(config.bookmarks).map(([k, v]) => (k === category ? [newName, v] : [k, v]));
    config.bookmarks = Object.fromEntries(entries);
    writeConfig(config);
    sendJson(res, 200, { ok: true, from: category, to: newName });
    return;
  }

  // ── Categories: delete ──────────────────────────────────────────────────
  if ((method === 'POST' || method === 'DELETE') && action === 'delete-category') {
    const body = (method === 'POST') ? (await readJsonBody(req) || {}) : {};
    const category = String(body.category || urlObj.searchParams.get('category') || '').trim();
    if (!category) { sendJson(res, 400, { error: 'category is required' }); return; }
    if (config.bookmarks[category] === undefined) { sendJson(res, 404, { error: 'Category not found' }); return; }
    const removedCount = config.bookmarks[category].length;
    delete config.bookmarks[category];
    writeConfig(config);
    sendJson(res, 200, { ok: true, category, removedCount });
    return;
  }

  // ── Categories: reorder ─────────────────────────────────────────────────
  if (method === 'POST' && action === 'reorder-categories') {
    const body = await readJsonBody(req) || {};
    if (!Array.isArray(body.order)) { sendJson(res, 400, { error: 'order must be an array of category names' }); return; }
    const current = config.bookmarks;
    const result = {};
    const used = new Set();
    for (const k of body.order) {
      if (typeof k === 'string' && current[k] !== undefined && !used.has(k)) { result[k] = current[k]; used.add(k); }
    }
    for (const k of Object.keys(current)) { if (!used.has(k)) result[k] = current[k]; }
    config.bookmarks = result;
    writeConfig(config);
    sendJson(res, 200, { ok: true, order: Object.keys(result) });
    return;
  }

  // ── Clipboard: list ─────────────────────────────────────────────────────
  if (method === 'GET' && action === 'clips') {
    sendJson(res, 200, { clips: config.clips, version: config.version || 0 });
    return;
  }

  // ── Clipboard: tag union (with counts) ──────────────────────────────────
  if (method === 'GET' && action === 'tags') {
    const counts = new Map(); // lowercase key -> { name, count }
    for (const c of config.clips) {
      for (const t of (c.tags || [])) {
        const key = String(t).toLowerCase();
        if (counts.has(key)) counts.get(key).count++;
        else counts.set(key, { name: t, count: 1 });
      }
    }
    sendJson(res, 200, { tags: [...counts.values()], version: config.version || 0 });
    return;
  }

  // ── Clipboard: add a text clip ──────────────────────────────────────────
  if (method === 'POST' && (action === 'clip' || action === 'add-clip')) {
    const body = await readJsonBody(req) || {};
    const text = (body.text || '').trim();
    const todayOnly = !!body.todayOnly;
    if (!text) { sendJson(res, 400, { error: 'No text provided' }); return; }
    const clip = {
      id: newClipId(),
      type: 'text',
      text,
      todayOnly,
      createdAt: new Date().toISOString(),
    };
    const tags = parseTags(body.tags);
    if (tags.length) clip.tags = tags;
    config.clips.unshift(clip);
    writeConfig(config);
    sendJson(res, 200, clip);
    return;
  }

  // ── Clipboard: add a file clip from JSON (base64 or plain text) ──────────
  // Agent-friendly alternative to multipart `upload`.
  if (method === 'POST' && action === 'add-file') {
    const body = await readJsonBody(req) || {};
    const rawName = String(body.filename || '').trim();
    if (!rawName) { sendJson(res, 400, { error: 'filename is required' }); return; }
    let buf;
    if (body.contentBase64 !== undefined && body.contentBase64 !== null) {
      try {
        buf = Buffer.from(String(body.contentBase64), 'base64');
      } catch (e) { sendJson(res, 400, { error: 'Invalid base64 content' }); return; }
    } else if (body.contentText !== undefined && body.contentText !== null) {
      buf = Buffer.from(String(body.contentText), 'utf8');
    } else {
      sendJson(res, 400, { error: 'Provide contentBase64 or contentText' }); return;
    }
    const todayOnly = !!body.todayOnly;
    const id = newClipId();
    const safeOriginal = sanitizeName(rawName);
    const safeName = id + '_' + safeOriginal;
    try {
      fs.writeFileSync(path.join(ATTACH_DIR, safeName), buf);
    } catch (e) {
      sendJson(res, 500, { error: 'Failed to save file' }); return;
    }
    const clip = {
      id,
      type: 'file',
      filename: safeName,
      originalName: rawName,
      size: buf.length,
      todayOnly,
      createdAt: new Date().toISOString(),
    };
    const tags = parseTags(body.tags);
    if (tags.length) clip.tags = tags;
    config.clips.unshift(clip);
    writeConfig(config);
    sendJson(res, 200, clip);
    return;
  }

  if (method === 'POST' && action === 'upload') {
    const ct = req.headers['content-type'] || '';
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!m) { sendJson(res, 400, { error: 'No multipart boundary' }); return; }
    const boundary = m[1] || m[2];
    let parsed;
    try {
      parsed = await parseMultipart(req, boundary);
    } catch (e) {
      sendJson(res, 500, { error: 'Upload failed: ' + e.message });
      return;
    }
    if (!parsed.file) { sendJson(res, 400, { error: 'No file received' }); return; }
    const todayOnly = (parsed.fields.todayOnly || '0') === '1';
    const id = newClipId();
    const safeOriginal = sanitizeName(parsed.file.filename || 'file');
    const safeName = id + '_' + safeOriginal;
    const dest = path.join(ATTACH_DIR, safeName);
    try {
      fs.renameSync(parsed.file.tmpPath, dest);
    } catch (e) {
      try { fs.unlinkSync(parsed.file.tmpPath); } catch (_) {}
      sendJson(res, 500, { error: 'Failed to save file' });
      return;
    }
    const clip = {
      id,
      type: 'file',
      filename: safeName,
      originalName: parsed.file.filename,
      size: parsed.file.size,
      todayOnly,
      createdAt: new Date().toISOString(),
    };
    const tags = parseTags(parsed.fields.tags);
    if (tags.length) clip.tags = tags;
    const fresh = readConfig();
    fresh.clips.unshift(clip);
    writeConfig(fresh);
    sendJson(res, 200, clip);
    return;
  }

  // ── Clipboard: edit a clip (text and/or todayOnly) ──────────────────────
  if (method === 'POST' && action === 'update-clip') {
    const body = await readJsonBody(req) || {};
    const id = urlObj.searchParams.get('id') || body.id || '';
    if (!id) { sendJson(res, 400, { error: 'Missing id' }); return; }
    if (body.text === undefined && body.todayOnly === undefined && body.tags === undefined) {
      sendJson(res, 400, { error: 'Provide text, todayOnly, and/or tags to update' });
      return;
    }
    const clip = config.clips.find((c) => idsMatch(c.id, id));
    if (!clip) { sendJson(res, 404, { error: 'Clip not found' }); return; }
    if (body.text !== undefined) {
      if (clip.type !== 'text') { sendJson(res, 400, { error: 'Only text clips support a text edit' }); return; }
      clip.text = String(body.text);
    }
    if (body.todayOnly !== undefined) clip.todayOnly = !!body.todayOnly;
    if (body.tags !== undefined) {
      const tags = parseTags(body.tags);
      if (tags.length) clip.tags = tags; else delete clip.tags;
    }
    writeConfig(config);
    sendJson(res, 200, { ok: true, clip });
    return;
  }

  // ── Clipboard: delete a clip (and its file, if any) ─────────────────────
  if ((method === 'DELETE' || method === 'POST') && (action === 'clip' || action === 'delete-clip')) {
    const body = (method === 'POST') ? (await readJsonBody(req) || {}) : {};
    const id = urlObj.searchParams.get('id') || body.id || '';
    if (!id) { sendJson(res, 400, { error: 'Missing id' }); return; }
    const target = config.clips.find((c) => idsMatch(c.id, id));
    // Remove the backing file for file clips (explicit filename wins, else the
    // one recorded on the clip).
    const filename = urlObj.searchParams.get('filename') || body.filename || (target && target.filename) || '';
    if (filename) {
      const p = path.join(ATTACH_DIR, path.basename(filename));
      if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
    }
    if (!target) { sendJson(res, 404, { error: 'Clip not found' }); return; }
    config.clips = config.clips.filter((c) => !idsMatch(c.id, id));
    writeConfig(config);
    sendJson(res, 200, { ok: true, removed: target });
    return;
  }

  sendJson(res, 404, { error: 'Unknown action' });
}

// ── One-time migration: backfill stable bookmark & clip ids ─────────────────
(() => {
  const cfg = readConfig();
  const bm = normalizeBookmarks(cfg.bookmarks || {});
  const cl = normalizeClips(cfg.clips || []);
  if (bm.changed || cl.changed) {
    cfg.bookmarks = bm.bookmarks;
    cfg.clips = cl.clips;
    writeConfig(cfg);
    console.log('Migrated config: assigned stable ids' +
      (bm.changed ? ' [bookmarks]' : '') + (cl.changed ? ' [clips]' : '') + '.');
  }
})();

// ── Server ──────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (e) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  const pathname = urlObj.pathname;

  if (pathname === '/api') {
    handleApi(req, res, urlObj).catch((e) => {
      if (!res.headersSent) sendJson(res, 500, { error: 'Server error: ' + e.message });
    });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// No socket timeout so very large uploads aren't cut off.
server.requestTimeout = 0;
server.headersTimeout = 0;

server.listen(PORT, HOST, () => {
  console.log(`Bookmark Dashboard running at http://localhost:${PORT}`);
  console.log(`Network: http://<this-machine-ip>:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
