const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'responses.json');

const BIN_ID = process.env.JSONBIN_BIN_ID;
const BIN_KEY = process.env.JSONBIN_API_KEY;
const USE_REMOTE = Boolean(BIN_ID && BIN_KEY);
const REMOTE_URL = 'https://api.jsonbin.io/v3/b/' + BIN_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

function readLocal() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeLocal(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function readData() {
  if (!USE_REMOTE) return readLocal();
  try {
    const res = await fetch(REMOTE_URL + '/latest', {
      headers: { 'X-Master-Key': BIN_KEY }
    });
    if (!res.ok) throw new Error('jsonbin read failed: ' + res.status);
    const json = await res.json();
    return json.record || {};
  } catch (e) {
    console.error('Remote read failed, falling back to local:', e.message);
    return readLocal();
  }
}

async function writeData(data) {
  if (!USE_REMOTE) {
    writeLocal(data);
    return;
  }
  try {
    const res = await fetch(REMOTE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': BIN_KEY
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('jsonbin write failed: ' + res.status);
  } catch (e) {
    console.error('Remote write failed, saving locally instead:', e.message);
    writeLocal(data);
  }
}

app.get('/api/responses', async (req, res) => {
  const data = await readData();
  res.json(data);
});

app.post('/api/responses', async (req, res) => {
  const { name, dates } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'ต้องระบุชื่อ' });
  }
  if (!Array.isArray(dates)) {
    return res.status(400).json({ error: 'dates ต้องเป็น array' });
  }
  const data = await readData();
  if (dates.length === 0) {
    delete data[name.trim()];
  } else {
    data[name.trim()] = dates;
  }
  await writeData(data);
  res.json({ ok: true, data });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('Storage mode: ' + (USE_REMOTE ? 'jsonbin.io (persistent)' : 'local file (ephemeral on Render free tier)'));
});

