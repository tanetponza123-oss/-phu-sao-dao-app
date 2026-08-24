const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'responses.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/responses', (req, res) => {
  res.json(readData());
});

app.post('/api/responses', (req, res) => {
  const { name, dates } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'ต้องระบุชื่อ' });
  }
  if (!Array.isArray(dates)) {
    return res.status(400).json({ error: 'dates ต้องเป็น array' });
  }
  const data = readData();
  if (dates.length === 0) {
    delete data[name.trim()];
  } else {
    data[name.trim()] = dates;
  }
  writeData(data);
  res.json({ ok: true, data });
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
