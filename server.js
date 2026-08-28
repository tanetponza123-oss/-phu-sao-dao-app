const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'responses.json');
const LEGACY_TOPIC = 'phu-sao-dao';

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

// Migrates the old flat {name: [dates]} shape (pre-topics) into
// { topics: { "phu-sao-dao": {name: [dates]}, ... } } without losing data.
function migrateIfNeeded(store) {
  if (store && store.topics && typeof store.topics === 'object') {
    return { store, migrated: false };
  }
  const legacyHasData = store && typeof store === 'object' &&
    Object.keys(store).some(k => k !== 'topics' && Array.isArray(store[k]));
  const migrated = { topics: {} };
  if (legacyHasData) {
    migrated.topics[LEGACY_TOPIC] = store;
  } else {
    migrated.topics[LEGACY_TOPIC] = {};
  }
  return { store: migrated, migrated: true };
}

async function readStore() {
  let raw;
  if (!USE_REMOTE) {
    raw = readLocal();
  } else {
    try {
      const res = await fetch(REMOTE_URL + '/latest', {
        headers: { 'X-Master-Key': BIN_KEY }
      });
      if (!res.ok) throw new Error('jsonbin read failed: ' + res.status);
      const json = await res.json();
      raw = json.record || {};
    } catch (e) {
      console.error('Remote read failed, falling back to local:', e.message);
      raw = readLocal();
    }
  }
  const { store, migrated } = migrateIfNeeded(raw);
  if (migrated) {
    await writeStore(store);
  }
  return store;
}

async function writeStore(store) {
  if (!USE_REMOTE) {
    writeLocal(store);
    return;
  }
  try {
    const res = await fetch(REMOTE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': BIN_KEY
      },
      body: JSON.stringify(store)
    });
    if (!res.ok) throw new Error('jsonbin write failed: ' + res.status);
  } catch (e) {
    console.error('Remote write failed, saving locally instead:', e.message);
    writeLocal(store);
  }
}

app.get('/api/responses', async (req, res) => {
  const topic = (req.query.topic || LEGACY_TOPIC).toString();
  const store = await readStore();
  res.json(store.topics[topic] || {});
});

app.post('/api/responses', async (req, res) => {
  const { name, dates, topic } = req.body;
  const topicKey = (topic || LEGACY_TOPIC).toString();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'ต้องระบุชื่อ' });
  }
  if (!Array.isArray(dates)) {
    return res.status(400).json({ error: 'dates ต้องเป็น array' });
  }
  const store = await readStore();
  if (!store.topics[topicKey]) store.topics[topicKey] = {};
  if (dates.length === 0) {
    delete store.topics[topicKey][name.trim()];
  } else {
    store.topics[topicKey][name.trim()] = dates;
  }
  await writeStore(store);
  res.json({ ok: true, data: store.topics[topicKey] });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
  console.log('Storage mode: ' + (USE_REMOTE ? 'jsonbin.io (persistent)' : 'local file (ephemeral on Render free tier)'));
});
