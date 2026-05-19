const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(__dirname));

function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.post('/api/bookmarks', (req, res) => {
  const config = readConfig();
  config.bookmarks = req.body;
  writeConfig(config);
  res.json({ ok: true });
});

app.post('/api/clips', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided' });
  const config = readConfig();
  const clip = {
    id: Date.now().toString(),
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  config.clips.unshift(clip);
  writeConfig(config);
  res.json(clip);
});

app.delete('/api/clips/:id', (req, res) => {
  const config = readConfig();
  config.clips = config.clips.filter(c => c.id !== req.params.id);
  writeConfig(config);
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bookmark Dashboard running at http://localhost:${PORT}`);
  console.log(`Also accessible on your local network via your machine's IP on port ${PORT}`);
});
