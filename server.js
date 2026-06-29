const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || process.env.LISTEN_PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const DEFAULT_USERS = [
  {id:'admin',        label:'Admin D-Groupe',      pwd:'DGroupe2026!',   role:'admin',sites:null,sitesExtra:[]},
  {id:'responsable',  label:'Resp. RH Distritec',  pwd:'Distritec2026!', role:'admin',sites:null,sitesExtra:[]},
  {id:'lyon',         label:'Lyon',                pwd:'Lyon2026!',      role:'site',sites:['Lyon'],sitesExtra:[]},
  {id:'bordeaux',     label:'Bordeaux',            pwd:'Bordeaux2026!',  role:'site',sites:['Bordeaux'],sitesExtra:[]},
  {id:'nantes',       label:'Nantes',              pwd:'Nantes2026!',    role:'site',sites:['Nantes'],sitesExtra:[]},
  {id:'toulouse',     label:'Toulouse',            pwd:'Toulouse2026!',  role:'site',sites:['Toulouse'],sitesExtra:[]},
  {id:'marseille',    label:'Marseille',           pwd:'Marseille2026!', role:'site',sites:['Marseille'],sitesExtra:[]},
  {id:'strasbourg',   label:'Strasbourg',          pwd:'Stras2026!',     role:'site',sites:['Strasbourg'],sitesExtra:[]},
  {id:'lille',        label:'Lille',               pwd:'Lille2026!',     role:'site',sites:['Lille'],sitesExtra:[]},
  {id:'rouen',        label:'Rouen',               pwd:'Rouen2026!',     role:'site',sites:['Rouen'],sitesExtra:[]},
  {id:'emerainvillehub', label:'Émerainville Hub', pwd:'EmHub2026!',     role:'site',sites:['Émerainville Hub'],sitesExtra:[]},
  {id:'emerainvilleat',  label:'Ém. Atelier',      pwd:'EmAt2026!',      role:'site',sites:['Émerainville atelier'],sitesExtra:[]},
  {id:'emerainvillerev', label:'Ém. Reverse',      pwd:'EmRev2026!',     role:'site',sites:['Émerainville Reverse'],sitesExtra:[]},
  {id:'morlaix',      label:'Morlaix',             pwd:'Morlaix2026!',   role:'site',sites:['Morlaix'],sitesExtra:[]},
  {id:'tours',        label:'Tours',               pwd:'Tours2026!',     role:'site',sites:['Tours'],sitesExtra:[]},
  {id:'montpellier',  label:'Montpellier',         pwd:'Mtp2026!',       role:'site',sites:['Montpellier'],sitesExtra:[]},
  {id:'nice',         label:'Nice',                pwd:'Nice2026!',      role:'site',sites:['Nice'],sitesExtra:[]},
  {id:'clermont',     label:'Clermont',            pwd:'Cler2026!',      role:'site',sites:['Clermont'],sitesExtra:[]},
  {id:'dijon',        label:'Dijon',               pwd:'Dijon2026!',     role:'site',sites:['Dijon'],sitesExtra:[]},
  {id:'nancy',        label:'Nancy',               pwd:'Nancy2026!',     role:'site',sites:['Nancy'],sitesExtra:[]},
  {id:'91distri',     label:'91Distri',            pwd:'91Distri2026!',  role:'site',sites:['91Distri'],sitesExtra:[]},
  {id:'77distri',     label:'77Distri',            pwd:'77Distri2026!',  role:'site',sites:['77Distri'],sitesExtra:[]},
];

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJSON(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {}
  return fallback;
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { uid, pwd } = req.body || {};
  const users = readJSON(USERS_FILE, DEFAULT_USERS);
  const user = users.find(u => u.id === uid && u.pwd === pwd);
  if (!user) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  const { pwd: _omit, ...safeUser } = user;
  res.json({ user: safeUser });
});

// ── Data (db) ─────────────────────────────────────────────────────────────────
app.get('/api/data', (req, res) => {
  res.json(readJSON(DATA_FILE, null));
});

app.post('/api/data', (req, res) => {
  writeJSON(DATA_FILE, req.body);
  res.json({ ok: true });
});

// ── Users ─────────────────────────────────────────────────────────────────────
app.get('/api/users', (req, res) => {
  res.json(readJSON(USERS_FILE, DEFAULT_USERS));
});

app.post('/api/users', (req, res) => {
  writeJSON(USERS_FILE, req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Distritec server → http://localhost:${PORT}`);
});
